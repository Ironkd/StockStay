import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  userOps,
  teamOps,
  organizationOps,
  membershipOps,
  invitationOps,
  passwordResetTokenOps,
  getMembershipContext,
  provisionOrganizationWithTeam,
} from "../db.js";
import { sendVerificationEmail } from "../email.js";
import { getPlanLimits } from "../trialManager.js";
import { skipRateLimitInTests } from "../middleware/authHelpers.js";

/**
 * @param {import("express").Express} app
 * @param {object} deps
 */
export function registerAuthRoutes(app, deps) {
  const {
    authenticateToken,
    JWT_SECRET,
    ensureMembershipContext,
    loadCurrentUser,
    buildAuthUserPayload,
  } = deps;

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInTests,
});

const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many reset requests. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInTests,
});

const resetPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many password reset attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInTests,
});

const verifyEmailRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: "Too many verification attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInTests,
});

// ==================== AUTH ROUTES ====================

const loginValidation = [
  body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email address"),
  body("password").notEmpty().trim().withMessage("Password is required"),
];

app.post("/api/auth/login", loginRateLimiter, loginValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return res.status(400).json({ message: firstError.msg || "Validation failed" });
    }

    const { email, password } = req.body;

    if (process.env.NODE_ENV !== "production") {
      console.log(`[LOGIN] Attempting login for: ${email}`);
    }
    let user;
    try {
      user = await userOps.findByEmail(email);
    } catch (findErr) {
      console.error("Login: findByEmail failed:", findErr.message, findErr.stack);
      return res.status(503).json({
        message: "Database error during login. Please try again.",
      });
    }
    if (process.env.NODE_ENV !== "production") {
      console.log(`[LOGIN] User found:`, user ? "Yes" : "No");
    }

    if (!user) {
      return res
        .status(401)
        .json({ message: "Account not found. Please sign up first." });
    }

    // Require email verification before login
    if (!user.emailVerified) {
      return res.status(403).json({
        message:
          "Please verify your email before signing in. Check your inbox for the verification link.",
      });
    }

    const rawPassword = typeof password === "string" ? password.trim() : "";
    let isPasswordValid = false;
    try {
      isPasswordValid = !!(
        rawPassword &&
        user.password &&
        (await bcrypt.compare(rawPassword, user.password))
      );
    } catch (bcryptErr) {
      console.warn("Login: bcrypt.compare failed:", bcryptErr.message);
    }
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid credentials. If you've forgotten your password, use Forgot password below.",
      });
    }

    // Ensure user has org/team; non-blocking if provision fails
    try {
      const ctxCheck = await getMembershipContext(user.id);
      if (!ctxCheck?.user?.teamId) {
        const display = (user.name || user.email.split("@")[0] || "My").trim();
        await provisionOrganizationWithTeam({
          ownerUserId: user.id,
          organizationName: `${display}'s Organization`,
          teamName: `${display}'s Team`,
        });
      }
    } catch (legacyErr) {
      console.warn("Login: org/team provision failed (continuing):", legacyErr.message);
    }

    if (!JWT_SECRET || typeof JWT_SECRET !== "string") {
      console.error("Login: JWT_SECRET is not set or invalid");
      return res.status(500).json({ message: "Server configuration error. Please try again later." });
    }

    let token;
    try {
      token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" }
      );
    } catch (jwtErr) {
      console.error("Login: jwt.sign failed:", jwtErr.message);
      return res.status(500).json({ message: "Server configuration error. Please try again later." });
    }

    const ctx = await ensureMembershipContext(user.id);
    const authUser = ctx ? buildAuthUserPayload(ctx) : {
      id: user.id,
      email: user.email || "",
      name: user.name || "",
      teamId: null,
      teamName: null,
      teamRole: null,
      memberships: [],
    };

    const payload = {
      user: authUser,
      token,
    };

    res.json(payload);
  } catch (error) {
    console.error("Login error:", error);
    console.error("Login error stack:", error.stack);
    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
      return res.status(503).json({
        message: "Database connection failed. Please check your Supabase connection.",
      });
    }
    res.status(500).json({ message: "Internal server error" });
  }
});

// Sign up: create user with emailVerified=false, send verification email
const signupRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { message: "Too many sign-up attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipRateLimitInTests,
});

const PASSWORD_RULES = {
  minLength: 8,
  hasUpper: /[A-Z]/,
  hasLower: /[a-z]/,
  hasNumber: /\d/,
  hasSymbol: /[^A-Za-z0-9]/,
};

function passwordStrengthMessage(value) {
  if (!value || value.length < PASSWORD_RULES.minLength) {
    return "Password must be at least 8 characters";
  }
  if (!PASSWORD_RULES.hasUpper.test(value)) {
    return "Password must contain at least one uppercase letter";
  }
  if (!PASSWORD_RULES.hasLower.test(value)) {
    return "Password must contain at least one lowercase letter";
  }
  if (!PASSWORD_RULES.hasNumber.test(value)) {
    return "Password must contain at least one number";
  }
  if (!PASSWORD_RULES.hasSymbol.test(value)) {
    return "Password must contain at least one symbol (e.g. !@#$%^&*)";
  }
  return null;
}

const signupValidation = [
  body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email address"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .custom((value) => {
      const msg = passwordStrengthMessage(value);
      if (msg) return Promise.reject(msg);
      return true;
    }),
  body("fullName").trim().notEmpty().withMessage("Full name is required"),
  body("firstName").optional().trim(),
  body("lastName").optional().trim(),
  body("address").optional().trim(),
  body("phoneNumber").optional().trim(),
  body("inviteToken").optional().trim(),
];

app.post("/api/auth/signup", signupRateLimiter, signupValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return res.status(400).json({ message: firstError.msg || "Validation failed" });
    }

    const { email, password, fullName, firstName, lastName, address, phoneNumber, inviteToken } = req.body;
    const first = typeof firstName === "string" ? firstName.trim() || null : null;
    const last = typeof lastName === "string" ? lastName.trim() || null : null;

    const existing = await userOps.findByEmail(email);
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists. Sign in or use a different email." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUserId = crypto.randomUUID();
    const verificationToken = crypto.randomUUID();
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Invited signup: validate token and email, then create user on existing team (no new team, no payment)
    if (inviteToken && typeof inviteToken === "string" && inviteToken.trim()) {
      const invitation = await invitationOps.findByToken(inviteToken.trim());
      const now = new Date();
      const validInvite =
        invitation &&
        invitation.status === "pending" &&
        (!invitation.expiresAt || new Date(invitation.expiresAt) >= now) &&
        invitation.email.toLowerCase() === email.toLowerCase();

      if (validInvite) {
        const user = await userOps.create({
          id: newUserId,
          email,
          name: fullName.trim(),
          firstName: first,
          lastName: last,
          password: hashedPassword,
          address: (address || "").trim() || null,
          phone: (phoneNumber || "").trim() || null,
          emailVerified: false,
          emailVerificationToken: verificationToken,
          emailVerificationExpiresAt: verificationExpiresAt,
        });

        await membershipOps.upsertForUserTeam(user.id, invitation.teamId, {
          teamRole: invitation.teamRole || "member",
          maxInventoryItems:
            typeof invitation.maxInventoryItems === "number" ? invitation.maxInventoryItems : null,
          allowedPages:
            Array.isArray(invitation.allowedPages) && invitation.allowedPages.length > 0
              ? invitation.allowedPages
              : null,
          allowedPropertyIds:
            Array.isArray(invitation.allowedPropertyIds) && invitation.allowedPropertyIds.length > 0
              ? invitation.allowedPropertyIds
              : null,
        });
        await userOps.update(user.id, { activeTeamId: invitation.teamId });

        await invitationOps.update(invitation.id, {
          status: "accepted",
          acceptedAt: now,
          acceptedByUserId: user.id,
        });

        await sendVerificationEmail(email, verificationToken, fullName.trim());

        const team = await teamOps.findById(invitation.teamId);
        const teamName = team ? team.name : "the team";

        return res.status(201).json({
          message: `Account created. You've joined ${teamName}. Check your email to verify your address, then sign in.`,
          joinedTeam: true,
          teamName,
        });
      }
    }

    // Normal signup: create org + team on Free plan (upgrade later from Settings)
    const freeLimits = getPlanLimits("free");
    const userMaxInventoryItems = freeLimits.maxInventoryItems ?? null;

    const user = await userOps.create({
      id: newUserId,
      email,
      name: fullName.trim(),
      firstName: first,
      lastName: last,
      password: hashedPassword,
      address: (address || "").trim() || null,
      phone: (phoneNumber || "").trim() || null,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiresAt: verificationExpiresAt,
    });

    const { organization, team } = await provisionOrganizationWithTeam({
      ownerUserId: user.id,
      organizationName: `${fullName.trim()}'s Organization`,
      teamName: `${fullName.trim()}'s Team`,
    });

    // Always start on Free; upgrades happen later from Settings (BR-23).
    if (userMaxInventoryItems != null) {
      await membershipOps.upsertForUserTeam(user.id, team.id, {
        teamRole: "owner",
        maxInventoryItems: userMaxInventoryItems,
      });
    }

    await sendVerificationEmail(email, verificationToken, fullName.trim());

    res.status(201).json({
      message:
        "Account created on the Free plan. Please check your email to verify your address before signing in.",
      organizationId: organization.id,
      teamId: team.id,
    });
  } catch (error) {
    console.error("Signup error:", error?.message || error);
    console.error("Signup error code:", error?.code);

    // Return helpful messages for known failures
    const code = error?.code;
    const msg = error?.message || "";

    if (code === "P2002") {
      return res.status(400).json({
        message: "An account with this email already exists. Sign in or use a different email.",
      });
    }
    if (code === "P2003" || msg.includes("Foreign key") || msg.includes("foreign key")) {
      return res.status(500).json({
        message: "Database setup error. Ensure all migrations have been run (e.g. npx prisma migrate deploy in the server folder).",
      });
    }
    if (msg.includes("column") && (msg.includes("does not exist") || msg.includes("undefined"))) {
      return res.status(500).json({
        message: "Database schema is out of date. Run migrations in the server folder: npx prisma migrate deploy",
      });
    }

    const isDev = process.env.NODE_ENV !== "production";
    res.status(500).json({
      message: isDev && msg ? msg : "Something went wrong creating your account. Please try again.",
    });
  }
});

// Verify email: token from link in email
app.get("/api/auth/verify-email", verifyEmailRateLimiter, async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== "string") {
      return res.status(400).json({ message: "Verification token is required." });
    }

    const user = await userOps.findByEmailVerificationToken(token);
    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired verification link. You can request a new one by signing up again or contacting support.",
      });
    }

    await userOps.update(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
    });

    res.json({ message: "Email verified successfully. You can now sign in." });
  } catch (error) {
    console.error("Verify email error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Forgot password: create token, send reset link email
const forgotPasswordValidation = [
  body("email").isEmail().normalizeEmail().withMessage("Please enter a valid email address"),
];
app.post("/api/auth/forgot-password", forgotPasswordRateLimiter, forgotPasswordValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return res.status(400).json({ message: firstError.msg || "Validation failed" });
    }
    const { email } = req.body;
    const user = await userOps.findByEmail(email);
    const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || "https://stockstay.com";
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await passwordResetTokenOps.deleteByUserId(user.id);
      await passwordResetTokenOps.create({ userId: user.id, token, expiresAt });
      const resetLink = `${APP_URL.replace(/\/$/, "")}/reset-password?token=${token}`;

      if (RESEND_API_KEY) {
        try {
          const { Resend } = await import("resend");
          const resend = new Resend(RESEND_API_KEY);
          const fromEmail = process.env.RESEND_FROM_EMAIL || "Stock Stay <onboarding@resend.dev>";
          await resend.emails.send({
            from: fromEmail,
            to: user.email,
            subject: "Reset your Stock Stay password",
            html: `
              <p>Hi${user.name ? ` ${user.name}` : ""},</p>
              <p>We received a request to reset your password for Stock Stay.</p>
              <p><a href="${resetLink}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">Reset password</a></p>
              <p>Or copy this link: ${resetLink}</p>
              <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
              <p>— Stock Stay</p>
            `,
          });
        } catch (err) {
          console.error("[FORGOT-PASSWORD] Resend error:", err.message);
          console.error("[FORGOT-PASSWORD] Email send failed for user id:", user.id);
        }
      } else {
        console.error("[FORGOT-PASSWORD] RESEND_API_KEY not set; reset email not sent for user id:", user.id);
      }
    }

    res.json({ message: "If an account exists with that email, we've sent a password reset link." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

// Reset password: validate token, set new password
const resetPasswordValidation = [
  body("token").notEmpty().trim().withMessage("Reset token is required"),
  body("password").notEmpty().trim().isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
];
app.post("/api/auth/reset-password", resetPasswordRateLimiter, resetPasswordValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return res.status(400).json({ message: firstError.msg || "Validation failed" });
    }
    const { token, password } = req.body;
    const record = await passwordResetTokenOps.findByToken(token);
    if (!record) {
      return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await userOps.update(record.userId, {
      password: hashedPassword,
      emailVerified: true,
    });
    await passwordResetTokenOps.deleteByUserId(record.userId);
    res.json({ message: "Password reset successfully. You can sign in now." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Something went wrong. Please try again." });
  }
});

app.post("/api/auth/logout", authenticateToken, (req, res) => {
  res.json({ message: "Logged out successfully" });
});

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const ctx = await ensureMembershipContext(req.user.id);
    if (!ctx) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(buildAuthUserPayload(ctx));
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.patch("/api/auth/profile", authenticateToken, async (req, res) => {
  try {
    const user = await loadCurrentUser(req);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const { email, phone, firstName, lastName, streetAddress, city, province, postalCode } = req.body || {};
    const updates = {};
    if (typeof email === "string") {
      const trimmed = email.trim();
      if (!trimmed) {
        return res.status(400).json({ message: "Email cannot be empty." });
      }
      const existing = await userOps.findByEmail(trimmed);
      if (existing && existing.id !== user.id) {
        return res.status(400).json({ message: "An account with this email already exists." });
      }
      updates.email = trimmed;
      updates.emailVerified = false;
    }
    if (typeof phone === "string") updates.phone = phone.trim() || null;
    if (typeof firstName === "string") updates.firstName = firstName.trim() || null;
    if (typeof lastName === "string") updates.lastName = lastName.trim() || null;
    if (typeof streetAddress === "string") updates.streetAddress = streetAddress.trim() || null;
    if (typeof city === "string") updates.city = city.trim() || null;
    if (typeof province === "string") updates.province = province.trim() || null;
    if (typeof postalCode === "string") updates.postalCode = postalCode.trim() || null;
    if (Object.keys(updates).length > 0 && (updates.firstName !== undefined || updates.lastName !== undefined)) {
      const first = updates.firstName !== undefined ? updates.firstName : user.firstName ?? "";
      const last = updates.lastName !== undefined ? updates.lastName : user.lastName ?? "";
      const full = [first, last].filter(Boolean).join(" ").trim();
      if (full) updates.name = full;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No profile fields to update." });
    }
    await userOps.update(user.id, updates);
    const ctx = await ensureMembershipContext(user.id);
    res.json(buildAuthUserPayload(ctx));
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Error updating profile" });
  }
});

app.post("/api/me/active-team", authenticateToken, async (req, res) => {
  try {
    const teamId = typeof req.body?.teamId === "string" ? req.body.teamId.trim() : "";
    if (!teamId) {
      return res.status(400).json({ message: "teamId is required" });
    }
    const membership = await membershipOps.findByUserAndTeam(req.user.id, teamId);
    if (!membership) {
      return res.status(403).json({ message: "You are not a member of that team" });
    }
    await userOps.update(req.user.id, { activeTeamId: teamId });
    const ctx = await ensureMembershipContext(req.user.id);
    res.json(buildAuthUserPayload(ctx));
  } catch (error) {
    console.error("Error switching active team:", error);
    res.status(500).json({ message: "Error switching team" });
  }
});

app.post("/api/organizations/:orgId/teams", authenticateToken, async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const org = await organizationOps.findById(orgId);
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }
    if (org.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Only the organization owner can create teams" });
    }
    const name =
      typeof req.body?.name === "string" && req.body.name.trim()
        ? req.body.name.trim()
        : "New Team";
    const team = await teamOps.create({
      name,
      ownerId: req.user.id,
      organizationId: org.id,
    });
    await membershipOps.upsertForUserTeam(req.user.id, team.id, { teamRole: "owner" });
    await userOps.update(req.user.id, { activeTeamId: team.id });
    const ctx = await ensureMembershipContext(req.user.id);
    res.status(201).json({
      team: { id: team.id, name: team.name, organizationId: team.organizationId },
      user: buildAuthUserPayload(ctx),
    });
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).json({ message: "Error creating team" });
  }
});
}
