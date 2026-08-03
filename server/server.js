import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import "dotenv/config";
import {
  userOps,
  teamOps,
  organizationOps,
  membershipOps,
  propertyOps,
  clientOps,
  invoiceOps,
  invitationOps,
  passwordResetTokenOps,
  unitOfMeasureOps,
  stockLocationOps,
  supplyItemOps,
  skuOps,
  prisma,
  getMembershipContext,
  provisionOrganizationWithTeam,
  ensureDefaultStockLocation,
} from "./db.js";
import {
  receiveStock,
  adjustStockOnHand,
  locationSupplyThresholdOps,
  stockTransactionOps,
} from "./stockLedger.js";
import {
  createReplenishment,
  createReturn,
  createInterPropertyTransfer,
  getReplenishment,
  getReturnableQty,
  listReplenishments,
  listUnbilledLines,
  listUnrevertedLinesForPropertySupply,
} from "./replenishment.js";
import {
  generateDraftInvoicesForTeam,
  generateDraftInvoicesForAllTeams,
  updateDraftInvoice,
  buildInvoicesCsv,
  ClientBillingError,
} from "./clientBilling.js";
import { buildInvoicePdf } from "./invoicePdf.js";
import { createCatalogueAuth, mapStockDomainError } from "./middleware/catalogueAuth.js";
import { computeUnitRate } from "./decimalUtil.js";
import { sendVerificationEmail, sendInvoiceEmail, sendInvitationEmail, sendSupportEmail } from "./email.js";
import {
  startProTrial,
  isTrialExpired,
  getEffectivePlan,
  getPlanLimits,
  getEffectiveMaxUsers,
  canCreateProperty,
  downgradeExpiredTrials,
  getTrialStatus,
  startStarterTrial,
} from "./trialManager.js";
import {
  createCheckoutSession,
  createCustomerPortalSession,
  ensureOrgStripeCustomer,
  ensureTeamStripeCustomer,
  handleWebhook,
  isBillingConfigured,
  stripe,
  updateExtraUserSlots,
} from "./billing.js";

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";
const appEnv = (process.env.APP_ENV || (isProduction ? "production" : "local")).toLowerCase();
const requiresJwtSecret = appEnv === "staging" || appEnv === "production";

// Trust proxy so rate limiting works behind Railway/load balancers (fixes ERR_ERL_UNEXPECTED_X_FORWARDED_FOR)
app.set("trust proxy", 1);

// Require JWT_SECRET in staging/production – never use default secret when deployed
if (requiresJwtSecret && !process.env.JWT_SECRET) {
  console.error(
    `FATAL: JWT_SECRET must be set when APP_ENV=${appEnv}. Set it in your environment.`
  );
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
// CORS: single origin or comma-separated list (e.g. https://stockstay.com,https://stockstay.ca)
// Capacitor mobile apps use capacitor://localhost (iOS) and http://localhost (Android) – always allow these when CORS is configured
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const corsOriginsRaw = CORS_ORIGIN
  ? CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : [];
const capacitorOrigins = ["capacitor://localhost", "http://localhost", "https://localhost"];
const corsOrigins =
  corsOriginsRaw.length > 0 ? [...new Set([...corsOriginsRaw, ...capacitorOrigins])] : [];

// Handle OPTIONS first (before any other middleware) so preflight never gets 502
app.options("*", (req, res) => {
  const origin = req.headers.origin;
  const allowed =
    corsOrigins.length === 0 ||
    (origin && corsOrigins.includes(origin));
  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.status(204).end();
});

// Root path – respond first so "Cannot GET /" never appears
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", service: "StockStay API", docs: "/api/health", appEnv });
});

// Security: secure headers
app.use(
  helmet({
    // Allow browser clients on another origin (Vite) to read API responses when CORS allows them
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Middleware – restrict origin in production for security
app.use(
  cors(
    corsOrigins.length > 0
      ? { origin: corsOrigins, credentials: true }
      : undefined
  )
);

// Stripe webhook must receive raw body for signature verification (before express.json)
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).send("Missing Stripe-Signature header");
    }
    try {
      await handleWebhook(req.body, signature);
      res.json({ received: true });
    } catch (err) {
      console.error("[BILLING] Webhook error:", err.message);
      res.status(400).send(err.message);
    }
  }
);

app.use(express.json());

// Rate limit for login – prevent brute force (10 attempts per 15 min per IP)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit for forgot-password (5 per 15 min per IP)
const forgotPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many reset requests. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

/** Ensure user has an org+team; return enriched membership context. */
async function ensureMembershipContext(userId) {
  let ctx = await getMembershipContext(userId);
  if (!ctx) return null;
  if (!ctx.user.teamId) {
    const display = (ctx.user.name || ctx.user.email.split("@")[0] || "My").trim();
    await provisionOrganizationWithTeam({
      ownerUserId: ctx.user.id,
      organizationName: `${display}'s Organization`,
      teamName: `${display}'s Team`,
    });
    ctx = await getMembershipContext(userId);
  }
  return ctx;
}

/** Enriched user with teamId/teamRole/scopes aliases (for existing route handlers). */
async function loadCurrentUser(req) {
  const ctx = await ensureMembershipContext(req.user.id);
  return ctx?.user ?? null;
}

function buildAuthUserPayload(ctx) {
  const user = ctx.user;
  const org = ctx.organization;
  const team = ctx.team;
  const effectivePlan = getEffectivePlan(org);
  const planLimits = getPlanLimits(effectivePlan);
  const maxInventoryItems =
    user.maxInventoryItems ?? (planLimits.maxInventoryItems ?? null);
  const teamName =
    team?.name?.trim() ||
    `${user.name || user.email.split("@")[0]}'s Team`;
  return {
    id: user.id,
    email: user.email || "",
    name: user.name || "",
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    address: user.address ?? "",
    streetAddress: user.streetAddress ?? "",
    city: user.city ?? "",
    province: user.province ?? "",
    postalCode: user.postalCode ?? "",
    phone: user.phone ?? "",
    teamId: user.teamId ?? null,
    activeTeamId: user.teamId ?? null,
    teamName,
    teamRole: user.teamRole ?? null,
    organizationId: user.organizationId ?? null,
    isOrgOwner: Boolean(user.isOrgOwner),
    maxInventoryItems,
    allowedPages: user.allowedPages ?? null,
    allowedPropertyIds: user.allowedPropertyIds ?? null,
    memberships: ctx.memberships ?? [],
  };
}

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

    console.log(`[LOGIN] Attempting login for: ${email}`);
    let user;
    try {
      user = await userOps.findByEmail(email);
    } catch (findErr) {
      console.error("Login: findByEmail failed:", findErr.message, findErr.stack);
      return res.status(503).json({
        message: "Database error during login. Please try again.",
      });
    }
    console.log(`[LOGIN] User found:`, user ? `Yes (${user.email})` : "No");

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
  body("startProTrial").optional().toBoolean(),
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

app.post("/api/auth/signup/checkout", signupRateLimiter, async (_req, res) => {
  // Payment is no longer required at signup (BR-23). Keep endpoint for old clients.
  return res.status(410).json({
    message:
      "Payment is no longer required to sign up. Create a free account, then upgrade from Settings after you sign in.",
  });
});

app.post("/api/auth/signup/complete", async (_req, res) => {
  return res.status(410).json({
    message:
      "Payment is no longer required to sign up. Create a free account from the login page, then upgrade from Settings.",
  });
});

// Verify email: token from link in email
app.get("/api/auth/verify-email", async (req, res) => {
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
          console.log("[FORGOT-PASSWORD] Reset link (email failed):", resetLink);
        }
      } else {
        console.log("[FORGOT-PASSWORD] RESEND_API_KEY not set. Reset link:", resetLink);
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
app.post("/api/auth/reset-password", resetPasswordValidation, async (req, res) => {
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
// Simple helper for page-level access control
const userHasPageAccess = (user, pageKey) => {
  if (!user) return false;
  // Home is always allowed
  if (pageKey === "home") return true;
  // Owners or users without restrictions can see everything
  if (!user.allowedPages || user.teamRole === "owner") return true;
  return Array.isArray(user.allowedPages) && user.allowedPages.includes(pageKey);
};

const {
  requireCatalogueRead,
  requireCatalogueWrite,
  requireInventoryRead,
  requireInventoryWrite,
} = createCatalogueAuth({ loadCurrentUser, userHasPageAccess });

// ==================== PROPERTY ROUTES ====================

// Get current team's properties
app.get("/api/properties", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }

    const properties = await propertyOps.findAllByTeam(currentUser.teamId);
    res.json(properties);
  } catch (error) {
    console.error("Error fetching properties:", error);
    res.status(500).json({ message: "Error fetching properties" });
  }
});

// Create a new property for the current team,
// enforcing plan-based maxProperties limits.
app.post("/api/properties", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }

    // Only owners can create properties (simple rule for now)
    if (currentUser.teamRole !== "owner") {
      return res
        .status(403)
        .json({ message: "Only team owners can create properties." });
    }

    const team = await teamOps.findById(currentUser.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found." });
    }

    let organization = await organizationOps.findById(team.organizationId);
    if (!organization) {
      return res.status(404).json({ message: "Organization not found." });
    }

    // Check if trial has expired and downgrade if needed
    if (organization.isOnTrial && isTrialExpired(organization)) {
      await organizationOps.update(organization.id, {
        plan: "free",
        isOnTrial: false,
        trialEndsAt: null,
        trialPlan: null,
        maxProperties: 1,
      });
      organization = await organizationOps.findById(organization.id);
      console.log(`[TRIAL] Auto-downgraded organization ${organization.id} from expired trial`);
    }

    // Use trial manager to check property limits (org plan, team property count)
    const currentCount = await propertyOps.countByTeam(team.id);
    const propertyCheck = canCreateProperty(organization, currentCount);

    if (!propertyCheck.canCreate) {
      const effectivePlan = getEffectivePlan(organization);
      return res.status(403).json({
        message:
          effectivePlan === "free"
            ? "Free plan allows only 1 property. Upgrade your plan to add more."
            : `Property limit reached for your current plan (${propertyCheck.limit} max).`,
        limit: propertyCheck.limit,
        current: propertyCheck.current,
        plan: propertyCheck.plan,
        upgradeAvailable: true,
      });
    }

    const { name, location, clientId, markupPercentage, stockLocationIds } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Property name is required." });
    }

    if (clientId) {
      const client = await clientOps.findById(clientId);
      if (!client || client.teamId !== currentUser.teamId) {
        return res.status(400).json({ message: "Billing client not found for this team." });
      }
    }

    const property = await propertyOps.createForTeam(currentUser.teamId, {
      name,
      location,
      clientId: clientId || null,
      markupPercentage:
        markupPercentage === undefined || markupPercentage === "" || markupPercentage === null
          ? null
          : markupPercentage,
    });

    // Link to stock locations (default: ensure Central supply exists and link it)
    let locationIds = Array.isArray(stockLocationIds)
      ? stockLocationIds.filter((id) => typeof id === "string" && id)
      : [];
    if (locationIds.length === 0) {
      const defaultLoc = await ensureDefaultStockLocation(currentUser.teamId);
      if (defaultLoc?.id) locationIds = [defaultLoc.id];
    }
    for (const locId of locationIds) {
      const loc = await stockLocationOps.findById(locId);
      if (!loc || loc.teamId !== currentUser.teamId || loc.archivedAt) {
        continue;
      }
      try {
        await stockLocationOps.linkProperty(locId, property.id);
      } catch (linkErr) {
        // Ignore unique conflicts (already linked)
        if (!isUniqueConstraintError(linkErr)) {
          console.warn("Failed to link property to stock location:", linkErr);
        }
      }
    }

    res.status(201).json(property);
  } catch (error) {
    console.error("Error creating property:", error);
    res.status(500).json({ message: "Error creating property" });
  }
});

app.put("/api/properties/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "You do not belong to a team." });
    }
    const teamProperties = await propertyOps.findAllByTeam(currentUser.teamId);
    const property = teamProperties.find((w) => w.id === req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }
    const { name, location, clientId, markupPercentage } = req.body;
    if (clientId) {
      const client = await clientOps.findById(clientId);
      if (!client || client.teamId !== currentUser.teamId) {
        return res.status(400).json({ message: "Billing client not found for this team." });
      }
    }
    const updated = await propertyOps.update(req.params.id, {
      name: typeof name === "string" ? name : property.name,
      location: typeof location === "string" ? location : property.location ?? "",
      ...(clientId !== undefined ? { clientId: clientId || null } : {}),
      ...(markupPercentage !== undefined
        ? {
            markupPercentage:
              markupPercentage === "" || markupPercentage === null ? null : markupPercentage,
          }
        : {}),
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating property:", error);
    res.status(500).json({ message: "Error updating property" });
  }
});

app.delete("/api/properties/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "You do not belong to a team." });
    }
    const teamProperties = await propertyOps.findAllByTeam(currentUser.teamId);
    const property = teamProperties.find((w) => w.id === req.params.id);
    if (!property) {
      return res.status(404).json({ message: "Property not found." });
    }
    await propertyOps.delete(req.params.id);
    res.json({ message: "Property deleted successfully" });
  } catch (error) {
    console.error("Error deleting property:", error);
    res.status(500).json({ message: "Error deleting property" });
  }
});

// ==================== CATALOGUE / STOCK LOCATION ROUTES ====================

function isUniqueConstraintError(error) {
  return error?.code === "P2002";
}

function parseDecimalInput(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return { error: `${fieldName} is required` };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { error: `${fieldName} must be a number` };
  }
  return { value: n };
}

app.get("/api/units-of-measure", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const units = await unitOfMeasureOps.findAll();
    res.json(units);
  } catch (error) {
    console.error("Error fetching units of measure:", error);
    res.status(500).json({ message: "Error fetching units of measure" });
  }
});

app.get("/api/stock-locations", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    if (!includeArchived) {
      await ensureDefaultStockLocation(req.currentUser.teamId);
    }
    const locations = await stockLocationOps.findAllByTeam(req.currentUser.teamId, { includeArchived });
    res.json(locations);
  } catch (error) {
    console.error("Error fetching stock locations:", error);
    res.status(500).json({ message: "Error fetching stock locations" });
  }
});

app.post("/api/stock-locations", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "Stock location name is required." });
    }
    const address =
      typeof req.body?.address === "string" ? req.body.address.trim() || null : null;
    const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const location = await stockLocationOps.create({
      teamId: req.currentUser.teamId,
      name,
      address,
      tags,
    });
    res.status(201).json(location);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A stock location with this name already exists." });
    }
    console.error("Error creating stock location:", error);
    res.status(500).json({ message: "Error creating stock location" });
  }
});

app.get("/api/stock-locations/:id", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const location = await stockLocationOps.findById(req.params.id);
    if (!location || location.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Stock location not found." });
    }
    res.json(location);
  } catch (error) {
    console.error("Error fetching stock location:", error);
    res.status(500).json({ message: "Error fetching stock location" });
  }
});

app.patch("/api/stock-locations/:id", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const existing = await stockLocationOps.findById(req.params.id);
    if (!existing || existing.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Stock location not found." });
    }
    const updates = {};
    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }
    if (req.body?.address !== undefined) {
      updates.address =
        req.body.address == null || req.body.address === ""
          ? null
          : String(req.body.address).trim();
    }
    if (req.body?.tags !== undefined) {
      updates.tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    }
    if (req.body?.archived === true) {
      updates.archivedAt = existing.archivedAt || new Date();
    } else if (req.body?.archived === false) {
      updates.archivedAt = null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid updates provided." });
    }
    const updated = await stockLocationOps.update(existing.id, updates);
    res.json(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A stock location with this name already exists." });
    }
    console.error("Error updating stock location:", error);
    res.status(500).json({ message: "Error updating stock location" });
  }
});

app.post("/api/stock-locations/:id/properties", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const location = await stockLocationOps.findById(req.params.id);
    if (!location || location.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Stock location not found." });
    }
    const propertyId = typeof req.body?.propertyId === "string" ? req.body.propertyId : "";
    if (!propertyId) {
      return res.status(400).json({ message: "propertyId is required." });
    }
    const teamProperties = await propertyOps.findAllByTeam(req.currentUser.teamId);
    const property = teamProperties.find((p) => p.id === propertyId);
    if (!property) {
      return res.status(400).json({ message: "Property must belong to the same team." });
    }
    const link = await stockLocationOps.linkProperty(location.id, propertyId);
    res.status(201).json(link);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "Property is already linked to this stock location." });
    }
    console.error("Error linking property to stock location:", error);
    res.status(500).json({ message: "Error linking property" });
  }
});

app.delete("/api/stock-locations/:id/properties/:propertyId", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const location = await stockLocationOps.findById(req.params.id);
    if (!location || location.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Stock location not found." });
    }
    await stockLocationOps.unlinkProperty(location.id, req.params.propertyId);
    res.json({ message: "Property unlinked" });
  } catch (error) {
    console.error("Error unlinking property from stock location:", error);
    res.status(500).json({ message: "Error unlinking property" });
  }
});

app.get("/api/supply-items", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const items = await supplyItemOps.findAllByTeam(req.currentUser.teamId, { includeArchived });
    res.json(items);
  } catch (error) {
    console.error("Error fetching supply items:", error);
    res.status(500).json({ message: "Error fetching supply items" });
  }
});

app.post("/api/supply-items", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "Supply item name is required." });
    }
    const baseUnitId = typeof req.body?.baseUnitId === "string" ? req.body.baseUnitId : "";
    if (!baseUnitId) {
      return res.status(400).json({ message: "baseUnitId is required." });
    }
    const unit = await unitOfMeasureOps.findById(baseUnitId);
    if (!unit) {
      return res.status(400).json({ message: "Invalid baseUnitId." });
    }
    const reorderPoint = parseDecimalInput(req.body?.defaultReorderPoint ?? 0, "defaultReorderPoint");
    if (reorderPoint.error) return res.status(400).json({ message: reorderPoint.error });
    const reorderQty = parseDecimalInput(
      req.body?.defaultReorderQuantity ?? 0,
      "defaultReorderQuantity"
    );
    if (reorderQty.error) return res.status(400).json({ message: reorderQty.error });
    if (reorderPoint.value < 0 || reorderQty.value < 0) {
      return res.status(400).json({ message: "Reorder defaults cannot be negative." });
    }
    const item = await supplyItemOps.create({
      teamId: req.currentUser.teamId,
      name,
      category: typeof req.body?.category === "string" ? req.body.category.trim() : "",
      baseUnitId,
      defaultReorderPoint: reorderPoint.value,
      defaultReorderQuantity: reorderQty.value,
    });
    res.status(201).json(item);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A supply item with this name already exists." });
    }
    console.error("Error creating supply item:", error);
    res.status(500).json({ message: "Error creating supply item" });
  }
});

app.get("/api/supply-items/:id", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const item = await supplyItemOps.findById(req.params.id);
    if (!item || item.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Supply item not found." });
    }
    res.json(item);
  } catch (error) {
    console.error("Error fetching supply item:", error);
    res.status(500).json({ message: "Error fetching supply item" });
  }
});

app.patch("/api/supply-items/:id", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const existing = await supplyItemOps.findById(req.params.id);
    if (!existing || existing.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "Supply item not found." });
    }
    const updates = {};
    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }
    if (typeof req.body?.category === "string") {
      updates.category = req.body.category.trim();
    }
    if (typeof req.body?.baseUnitId === "string" && req.body.baseUnitId) {
      const unit = await unitOfMeasureOps.findById(req.body.baseUnitId);
      if (!unit) {
        return res.status(400).json({ message: "Invalid baseUnitId." });
      }
      updates.baseUnitId = req.body.baseUnitId;
    }
    if (req.body?.defaultReorderPoint !== undefined) {
      const parsed = parseDecimalInput(req.body.defaultReorderPoint, "defaultReorderPoint");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (parsed.value < 0) {
        return res.status(400).json({ message: "defaultReorderPoint cannot be negative." });
      }
      updates.defaultReorderPoint = parsed.value;
    }
    if (req.body?.defaultReorderQuantity !== undefined) {
      const parsed = parseDecimalInput(req.body.defaultReorderQuantity, "defaultReorderQuantity");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (parsed.value < 0) {
        return res.status(400).json({ message: "defaultReorderQuantity cannot be negative." });
      }
      updates.defaultReorderQuantity = parsed.value;
    }
    if (req.body?.archived === true) {
      updates.archivedAt = existing.archivedAt || new Date();
    } else if (req.body?.archived === false) {
      updates.archivedAt = null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid updates provided." });
    }
    const updated = await supplyItemOps.update(existing.id, updates);
    res.json(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A supply item with this name already exists." });
    }
    console.error("Error updating supply item:", error);
    res.status(500).json({ message: "Error updating supply item" });
  }
});

app.get("/api/skus", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === "true";
    const supplyItemId =
      typeof req.query.supplyItemId === "string" ? req.query.supplyItemId : undefined;
    const stockLocationId =
      typeof req.query.stockLocationId === "string" ? req.query.stockLocationId : undefined;
    const skus = await skuOps.findAllByTeam(req.currentUser.teamId, {
      includeArchived,
      supplyItemId,
      stockLocationId,
    });
    res.json(skus);
  } catch (error) {
    console.error("Error fetching SKUs:", error);
    res.status(500).json({ message: "Error fetching SKUs" });
  }
});

app.post("/api/skus", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) {
      return res.status(400).json({ message: "SKU name is required." });
    }
    const supplyItemId = typeof req.body?.supplyItemId === "string" ? req.body.supplyItemId : "";
    if (!supplyItemId) {
      return res.status(400).json({ message: "supplyItemId is required." });
    }
    const supplyItem = await supplyItemOps.findById(supplyItemId);
    if (!supplyItem || supplyItem.teamId !== req.currentUser.teamId || supplyItem.archivedAt) {
      return res.status(400).json({ message: "Invalid or archived supply item." });
    }
    const packSize = parseDecimalInput(req.body?.packSize, "packSize");
    if (packSize.error) return res.status(400).json({ message: packSize.error });
    if (!(packSize.value > 0)) {
      return res.status(400).json({ message: "packSize must be greater than zero." });
    }
    const purchasePrice = parseDecimalInput(req.body?.purchasePrice, "purchasePrice");
    if (purchasePrice.error) return res.status(400).json({ message: purchasePrice.error });
    if (purchasePrice.value < 0) {
      return res.status(400).json({ message: "purchasePrice cannot be negative." });
    }
    const unitRate = computeUnitRate(purchasePrice.value, packSize.value).toString();
    const stockLocationId =
      typeof req.body?.stockLocationId === "string" ? req.body.stockLocationId.trim() : "";
    if (stockLocationId) {
      const location = await stockLocationOps.findById(stockLocationId);
      if (!location || location.teamId !== req.currentUser.teamId || location.archivedAt) {
        return res.status(400).json({ message: "Invalid or archived stock location." });
      }
    }
    const sku = await skuOps.create({
      teamId: req.currentUser.teamId,
      supplyItemId,
      name,
      supplier:
        typeof req.body?.supplier === "string" ? req.body.supplier.trim() || null : null,
      packSize: packSize.value,
      purchasePrice: purchasePrice.value,
      unitRate,
    });
    if (stockLocationId) {
      await skuOps.ensureStockOnHand(sku.id, stockLocationId);
      const withSoh = await skuOps.findById(sku.id, { stockLocationId });
      return res.status(201).json(withSoh);
    }
    res.status(201).json(sku);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A SKU with this name already exists." });
    }
    console.error("Error creating SKU:", error);
    res.status(500).json({ message: "Error creating SKU" });
  }
});

app.get("/api/skus/:id", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const sku = await skuOps.findById(req.params.id);
    if (!sku || sku.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "SKU not found." });
    }
    res.json(sku);
  } catch (error) {
    console.error("Error fetching SKU:", error);
    res.status(500).json({ message: "Error fetching SKU" });
  }
});

app.patch("/api/skus/:id", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const existing = await skuOps.findById(req.params.id);
    if (!existing || existing.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "SKU not found." });
    }
    const updates = {};
    if (typeof req.body?.name === "string" && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }
    if (req.body?.supplier !== undefined) {
      updates.supplier =
        req.body.supplier == null || req.body.supplier === ""
          ? null
          : String(req.body.supplier).trim();
    }
    let nextPackSize = Number(existing.packSize);
    let nextPurchasePrice = Number(existing.purchasePrice);
    let recomputeRate = false;
    if (req.body?.packSize !== undefined) {
      const parsed = parseDecimalInput(req.body.packSize, "packSize");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (!(parsed.value > 0)) {
        return res.status(400).json({ message: "packSize must be greater than zero." });
      }
      updates.packSize = parsed.value;
      nextPackSize = parsed.value;
      recomputeRate = true;
    }
    if (req.body?.purchasePrice !== undefined) {
      const parsed = parseDecimalInput(req.body.purchasePrice, "purchasePrice");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (parsed.value < 0) {
        return res.status(400).json({ message: "purchasePrice cannot be negative." });
      }
      updates.purchasePrice = parsed.value;
      nextPurchasePrice = parsed.value;
      recomputeRate = true;
    }
    if (recomputeRate) {
      updates.unitRate = computeUnitRate(nextPurchasePrice, nextPackSize).toString();
    }
    if (req.body?.archived === true) {
      updates.archivedAt = existing.archivedAt || new Date();
    } else if (req.body?.archived === false) {
      updates.archivedAt = null;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid updates provided." });
    }
    const updated = await skuOps.update(existing.id, updates);
    res.json(updated);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ message: "A SKU with this name already exists." });
    }
    console.error("Error updating SKU:", error);
    res.status(500).json({ message: "Error updating SKU" });
  }
});

app.post("/api/skus/:id/stock-locations/:locationId", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const sku = await skuOps.findById(req.params.id);
    if (!sku || sku.teamId !== req.currentUser.teamId) {
      return res.status(404).json({ message: "SKU not found." });
    }
    const location = await stockLocationOps.findById(req.params.locationId);
    if (!location || location.teamId !== req.currentUser.teamId || location.archivedAt) {
      return res.status(400).json({ message: "Invalid or archived stock location." });
    }
    await skuOps.ensureStockOnHand(sku.id, location.id);
    const updated = await skuOps.findById(sku.id, { stockLocationId: location.id });
    res.status(201).json(updated);
  } catch (error) {
    console.error("Error stocking SKU at location:", error);
    res.status(500).json({ message: "Error stocking SKU at location" });
  }
});

app.post("/api/skus/:id/receive", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const stockLocationId =
      typeof req.body?.stockLocationId === "string" ? req.body.stockLocationId.trim() : "";
    if (!stockLocationId) {
      return res.status(400).json({ message: "stockLocationId is required." });
    }
    const qty = parseDecimalInput(req.body?.quantity, "quantity");
    if (qty.error) return res.status(400).json({ message: qty.error });
    if (!(qty.value > 0)) {
      return res.status(400).json({ message: "quantity must be greater than zero." });
    }
    let purchasePrice = req.body?.purchasePrice;
    if (purchasePrice !== undefined && purchasePrice !== null && purchasePrice !== "") {
      const parsed = parseDecimalInput(purchasePrice, "purchasePrice");
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      if (parsed.value < 0) {
        return res.status(400).json({ message: "purchasePrice cannot be negative." });
      }
      purchasePrice = parsed.value;
    } else {
      purchasePrice = undefined;
    }
    const purchasedAt =
      typeof req.body?.purchasedAt === "string" && req.body.purchasedAt.trim()
        ? req.body.purchasedAt.trim()
        : undefined;
    const result = await receiveStock({
      teamId: req.currentUser.teamId,
      skuId: req.params.id,
      stockLocationId,
      packQty: qty.value,
      purchasePrice,
      purchasedAt,
      userId: req.currentUser.id,
    });
    const sku = await skuOps.findById(req.params.id, { stockLocationId });
    res.status(201).json({ ...result, sku });
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error receiving stock:", error);
    res.status(500).json({ message: "Error receiving stock" });
  }
});

app.post("/api/skus/:id/adjust", authenticateToken, requireCatalogueWrite, async (req, res) => {
  try {
    const stockLocationId =
      typeof req.body?.stockLocationId === "string" ? req.body.stockLocationId.trim() : "";
    if (!stockLocationId) {
      return res.status(400).json({ message: "stockLocationId is required." });
    }
    const delta = parseDecimalInput(req.body?.quantityDelta, "quantityDelta");
    if (delta.error) return res.status(400).json({ message: delta.error });
    if (delta.value === 0) {
      return res.status(400).json({ message: "quantityDelta cannot be zero." });
    }
    const result = await adjustStockOnHand({
      teamId: req.currentUser.teamId,
      skuId: req.params.id,
      stockLocationId,
      quantityDelta: delta.value,
      reason: typeof req.body?.reason === "string" ? req.body.reason : null,
      userId: req.currentUser.id,
    });
    const sku = await skuOps.findById(req.params.id, { stockLocationId });
    res.json({ ...result, sku });
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error adjusting stock:", error);
    res.status(500).json({ message: "Error adjusting stock" });
  }
});

app.get(
  "/api/stock-locations/:locationId/supply-thresholds",
  authenticateToken,
  requireCatalogueRead,
  async (req, res) => {
    try {
      const rows = await locationSupplyThresholdOps.listByLocation(
        req.currentUser.teamId,
        req.params.locationId
      );
      if (rows == null) {
        return res.status(404).json({ message: "Stock location not found" });
      }
      res.json(rows);
    } catch (error) {
      if (mapStockDomainError(res, error)) return;
      console.error("Error fetching supply thresholds:", error);
      res.status(500).json({ message: "Error fetching supply thresholds" });
    }
  }
);

app.put(
  "/api/stock-locations/:locationId/supply-thresholds",
  authenticateToken,
  requireInventoryWrite,
  async (req, res) => {
    try {
      const { supplyItemId, reorderPoint, reorderQuantity } = req.body || {};
      if (!supplyItemId) {
        return res.status(400).json({ message: "supplyItemId is required." });
      }
      const row = await locationSupplyThresholdOps.upsert(
        req.currentUser.teamId,
        req.params.locationId,
        supplyItemId,
        { reorderPoint, reorderQuantity }
      );
      res.json(row);
    } catch (error) {
      if (mapStockDomainError(res, error)) return;
      console.error("Error upserting supply threshold:", error);
      res.status(500).json({ message: "Error updating supply threshold" });
    }
  }
);

app.get("/api/location-low-stock", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const rows = await locationSupplyThresholdOps.listLowStock(req.currentUser.teamId);
    res.json(rows);
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error fetching location low stock:", error);
    res.status(500).json({ message: "Error fetching location low stock" });
  }
});

app.get("/api/stock-transactions", authenticateToken, requireCatalogueRead, async (req, res) => {
  try {
    const rows = await stockTransactionOps.findAllByTeam(req.currentUser.teamId, {
      entityType: typeof req.query.entityType === "string" ? req.query.entityType : undefined,
      entityId: typeof req.query.entityId === "string" ? req.query.entityId : undefined,
      skuId: typeof req.query.skuId === "string" ? req.query.skuId : undefined,
      stockLocationId:
        typeof req.query.stockLocationId === "string" ? req.query.stockLocationId : undefined,
      postingId: typeof req.query.postingId === "string" ? req.query.postingId : undefined,
      transactionType:
        typeof req.query.transactionType === "string" ? req.query.transactionType : undefined,
      fromDate: typeof req.query.fromDate === "string" ? req.query.fromDate : undefined,
      toDate: typeof req.query.toDate === "string" ? req.query.toDate : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 200,
    });
    res.json(rows);
  } catch (error) {
    console.error("Error fetching stock transactions:", error);
    res.status(500).json({ message: "Error fetching stock transactions" });
  }
});

app.post("/api/replenishments", authenticateToken, requireInventoryWrite, async (req, res) => {
  try {
    const { stockLocationId, propertyId, lines } = req.body || {};
    if (!stockLocationId || !propertyId) {
      return res.status(400).json({ message: "stockLocationId and propertyId are required." });
    }
    const result = await createReplenishment({
      teamId: req.currentUser.teamId,
      stockLocationId,
      propertyId,
      lines: Array.isArray(lines) ? lines : [],
      userId: req.currentUser.id,
    });
    res.status(201).json(result);
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error creating replenishment:", error);
    res.status(500).json({ message: "Error creating replenishment" });
  }
});

app.get("/api/replenishments", authenticateToken, requireInventoryRead, async (req, res) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const transferGroupId =
      typeof req.query.transferGroupId === "string" ? req.query.transferGroupId : undefined;
    const rows = await listReplenishments(req.currentUser.teamId, { limit, transferGroupId });
    res.json(rows);
  } catch (error) {
    console.error("Error listing replenishments:", error);
    res.status(500).json({ message: "Error listing replenishments" });
  }
});

app.post("/api/replenishments/transfers", authenticateToken, requireInventoryWrite, async (req, res) => {
  try {
    const { fromPropertyId, toPropertyId, stockLocationId, skuId, baseQty } = req.body || {};
    if (!fromPropertyId || !toPropertyId || !stockLocationId || !skuId || baseQty == null) {
      return res.status(400).json({
        message: "fromPropertyId, toPropertyId, stockLocationId, skuId, and baseQty are required.",
      });
    }
    const result = await createInterPropertyTransfer({
      teamId: req.currentUser.teamId,
      fromPropertyId,
      toPropertyId,
      stockLocationId,
      skuId,
      baseQty,
      userId: req.currentUser.id,
    });
    res.status(201).json(result);
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error creating inter-property transfer:", error);
    res.status(500).json({
      message: "Error creating transfer",
      transferGroupId: error.transferGroupId || error.details?.transferGroupId,
      details: error.details,
    });
  }
});

app.post("/api/replenishments/returns", authenticateToken, requireInventoryWrite, async (req, res) => {
  try {
    const { reversesLineId, baseQty, stockLocationId, skuId } = req.body || {};
    if (!reversesLineId || baseQty == null) {
      return res.status(400).json({ message: "reversesLineId and baseQty are required." });
    }
    const result = await createReturn({
      teamId: req.currentUser.teamId,
      reversesLineId,
      baseQty,
      stockLocationId: stockLocationId || undefined,
      skuId: skuId || undefined,
      userId: req.currentUser.id,
    });
    res.status(201).json(result);
  } catch (error) {
    if (mapStockDomainError(res, error)) return;
    console.error("Error creating return:", error);
    res.status(500).json({ message: "Error creating return" });
  }
});

app.get(
  "/api/replenishments/unreverted",
  authenticateToken,
  requireInventoryRead,
  async (req, res) => {
    try {
      const propertyId = typeof req.query.propertyId === "string" ? req.query.propertyId : "";
      const supplyItemId =
        typeof req.query.supplyItemId === "string" ? req.query.supplyItemId : "";
      if (!propertyId || !supplyItemId) {
        return res
          .status(400)
          .json({ message: "propertyId and supplyItemId query params are required." });
      }
      const result = await listUnrevertedLinesForPropertySupply(
        req.currentUser.teamId,
        propertyId,
        supplyItemId
      );
      res.json(result);
    } catch (error) {
      if (mapStockDomainError(res, error)) return;
      console.error("Error listing unreverted lines:", error);
      res.status(500).json({ message: "Error listing unreverted lines" });
    }
  }
);

app.get("/api/replenishments/lines/:id/returnable", authenticateToken, requireInventoryRead, async (req, res) => {
  try {
    const row = await getReturnableQty(req.currentUser.teamId, req.params.id);
    if (!row) return res.status(404).json({ message: "Line not found." });
    res.json(row);
  } catch (error) {
    console.error("Error fetching returnable qty:", error);
    res.status(500).json({ message: "Error fetching returnable qty" });
  }
});

app.get("/api/replenishments/:id", authenticateToken, requireInventoryRead, async (req, res) => {
  try {
    const row = await getReplenishment(req.currentUser.teamId, req.params.id);
    if (!row) return res.status(404).json({ message: "Replenishment not found." });
    res.json(row);
  } catch (error) {
    console.error("Error fetching replenishment:", error);
    res.status(500).json({ message: "Error fetching replenishment" });
  }
});

app.get("/api/unbilled-lines", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }
    const canAccess =
      userHasPageAccess(currentUser, "invoices") || userHasPageAccess(currentUser, "inventory");
    if (!canAccess) {
      return res.status(403).json({ message: "You do not have access to unbilled lines." });
    }
    const rows = await listUnbilledLines(currentUser.teamId);
    res.json(rows);
  } catch (error) {
    console.error("Error listing unbilled lines:", error);
    res.status(500).json({ message: "Error listing unbilled lines" });
  }
});

// ==================== BILLING (STRIPE) ROUTES ====================

const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";

app.post("/api/billing/create-checkout-session", authenticateToken, async (req, res) => {
  try {
    if (!isBillingConfigured()) {
      return res.status(503).json({ message: "Billing is not configured. Contact support." });
    }
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.organizationId) {
      return res.status(400).json({ message: "You must belong to an organization to upgrade." });
    }
    if (!currentUser.isOrgOwner) {
      return res.status(403).json({ message: "Only the organization owner can manage billing." });
    }
    const base = (APP_URL || "").replace(/\/$/, "");
    const successUrl = req.body.successUrl || `${base}/dashboard?checkout=success`;
    const cancelUrl = req.body.cancelUrl || `${base}/pricing?checkout=cancelled`;
    const plan = req.body.plan === "starter" ? "starter" : "pro";
    const billingPeriod = req.body.billingPeriod === "annual" ? "annual" : "monthly";
    const stripeTrialDays = typeof req.body.stripeTrialDays === "number" ? req.body.stripeTrialDays : 14;
    const { url } = await createCheckoutSession({
      organizationId: currentUser.organizationId,
      customerEmail: currentUser.email,
      successUrl,
      cancelUrl,
      plan,
      billingPeriod,
      stripeTrialDays,
    });
    res.json({ url });
  } catch (error) {
    console.error("Create checkout session error:", error);
    res.status(500).json({ message: error.message || "Failed to create checkout session." });
  }
});

app.post("/api/billing/customer-portal", authenticateToken, async (req, res) => {
  try {
    if (!isBillingConfigured()) {
      return res.status(503).json({ message: "Billing is not configured. Contact support." });
    }
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.organizationId) {
      return res.status(400).json({ message: "You must belong to an organization." });
    }
    if (!currentUser.isOrgOwner) {
      return res.status(403).json({ message: "Only the organization owner can manage billing." });
    }
    const customerId = await ensureOrgStripeCustomer(currentUser.organizationId, currentUser.email);
    const base = (APP_URL || "").replace(/\/$/, "");
    const returnUrl = req.body.returnUrl || `${base}/settings`;
    const { url } = await createCustomerPortalSession({
      customerId,
      returnUrl,
    });
    res.json({ url });
  } catch (error) {
    console.error("Customer portal error:", error);
    res.status(500).json({ message: error.message || "Failed to open billing portal." });
  }
});

/** Set extra user slots (Starter: 0–2, Pro: 0–3). $5/mo per slot. Requires STRIPE_EXTRA_USER_PRICE_ID. */
app.patch("/api/billing/extra-user", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser?.organizationId) {
      return res.status(400).json({ message: "You must belong to an organization." });
    }
    if (!currentUser.isOrgOwner) {
      return res.status(403).json({ message: "Only the organization owner can manage extra user slots." });
    }
    const org = await organizationOps.findById(currentUser.organizationId);
    if (!org) return res.status(404).json({ message: "Organization not found." });
    const effectivePlan = getEffectivePlan(org);
    const limits = getPlanLimits(effectivePlan);
    if (limits.baseMaxUsers == null) {
      return res.status(400).json({ message: "Extra user slots are only for Starter and Pro plans." });
    }
    const maxExtra = limits.maxExtraUserSlots ?? 0;
    const quantity = typeof req.body.quantity === "number" ? Math.max(0, Math.min(maxExtra, Math.floor(req.body.quantity))) : (org.extraUserSlots ?? 0);
    const result = await updateExtraUserSlots(currentUser.organizationId, quantity);
    res.json(result);
  } catch (error) {
    console.error("Extra user slots error:", error);
    res.status(500).json({ message: error.message || "Failed to update extra user slots." });
  }
});

// ==================== CLIENTS ROUTES ====================

app.get("/api/clients", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    // Allow list for Clients access OR Inventory access (so inventory members can pick client when billing from +/-)
    const canListClients =
      userHasPageAccess(currentUser, "clients") || userHasPageAccess(currentUser, "inventory");
    if (!canListClients) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    if (!currentUser?.teamId) {
      return res.json([]);
    }

    const clients = await clientOps.findAll(currentUser.teamId);
    res.json(clients);
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ message: "Error fetching clients" });
  }
});

app.get("/api/clients/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const client = await clientOps.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    if (client.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Client not found" });
    }

    res.json(client);
  } catch (error) {
    console.error("Error fetching client:", error);
    res.status(500).json({ message: "Error fetching client" });
  }
});

app.post("/api/clients", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    if (!currentUser?.teamId) {
      return res.status(403).json({ message: "You must belong to a team to create clients." });
    }
    const newClient = await clientOps.create({ ...req.body, teamId: currentUser.teamId });
    res.status(201).json(newClient);
  } catch (error) {
    console.error("Error creating client:", error);
    res.status(500).json({ message: "Error creating client" });
  }
});

app.put("/api/clients/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const client = await clientOps.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    if (client.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Client not found" });
    }

    const updatedClient = await clientOps.update(req.params.id, req.body);
    res.json(updatedClient);
  } catch (error) {
    console.error("Error updating client:", error);
    res.status(500).json({ message: "Error updating client" });
  }
});

app.delete("/api/clients/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "clients")) {
      return res.status(403).json({ message: "You do not have access to Clients." });
    }
    const client = await clientOps.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ message: "Client not found" });
    }
    if (client.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Client not found" });
    }

    await clientOps.delete(req.params.id);
    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).json({ message: "Error deleting client" });
  }
});

// ==================== INVOICES ROUTES ====================

app.get("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    if (!currentUser?.teamId) {
      return res.json([]);
    }

    const invoices = await invoiceOps.findAll(currentUser.teamId);
    res.json(invoices);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Error fetching invoices" });
  }
});

app.get("/api/invoices/export.csv", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const idsRaw = typeof req.query.ids === "string" ? req.query.ids : "";
    const ids = idsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    let invoices = await invoiceOps.findAll(currentUser.teamId);
    if (ids.length > 0) {
      const idSet = new Set(ids);
      invoices = invoices.filter((inv) => idSet.has(inv.id));
    }
    const csv = buildInvoicesCsv(invoices);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting invoices CSV:", error);
    res.status(500).json({ message: "Error exporting invoices" });
  }
});

app.get("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (invoice.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.json(invoice);
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ message: "Error fetching invoice" });
  }
});

app.post("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    // Allow create for users with Invoices access (inventory bill-to path retired)
    const canCreateInvoice =
      userHasPageAccess(currentUser, "invoices") || userHasPageAccess(currentUser, "inventory");
    if (!canCreateInvoice) {
      return res.status(403).json({ message: "You do not have access to create invoices." });
    }
    const invoiceData = req.body;

    if (
      invoiceData.items &&
      Array.isArray(invoiceData.items) &&
      invoiceData.items.some((item) => item.inventoryItemId)
    ) {
      return res.status(410).json({
        message:
          "Billing from inventory items is retired. Use replenishment (POST /api/replenishments); charges appear on unbilled lines until scheduled invoicing.",
        code: "GONE",
      });
    }

    const newInvoice = await invoiceOps.create({
      ...invoiceData,
      teamId: currentUser?.teamId ?? undefined,
    });
    res.status(201).json(newInvoice);
  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({ message: "Error creating invoice" });
  }
});

app.put("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const existingInvoice = await invoiceOps.findById(req.params.id);

    if (!existingInvoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (existingInvoice.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const body = req.body || {};
    if (
      (existingInvoice.lines && existingInvoice.lines.length > 0) ||
      body.taxRate !== undefined ||
      (existingInvoice.billingPeriodStart && body.items === undefined)
    ) {
      try {
        const updated = await updateDraftInvoice(currentUser.teamId, req.params.id, {
          taxRate: body.taxRate,
          notes: body.notes,
          status: body.status,
          dueDate: body.dueDate,
          date: body.date,
        });
        return res.json(updated);
      } catch (err) {
        if (err instanceof ClientBillingError) {
          return res.status(err.code === "NOT_FOUND" ? 404 : 400).json({ message: err.message });
        }
        throw err;
      }
    }

    const updatedInvoice = await invoiceOps.update(req.params.id, body);
    res.json(updatedInvoice);
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({ message: "Error updating invoice" });
  }
});

app.delete("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (invoice.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    await invoiceOps.delete(req.params.id);
    res.json({ message: "Invoice deleted successfully" });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ message: "Error deleting invoice" });
  }
});

app.post("/api/invoices/:id/send", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (invoice.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    if (!invoice.clientId) {
      return res.status(400).json({ message: "This invoice has no client. Add a client before sending." });
    }
    const client = await clientOps.findById(invoice.clientId);
    if (!client) {
      return res.status(400).json({ message: "Client not found." });
    }
    const clientEmail = (client.email && String(client.email).trim()) || null;
    if (!clientEmail) {
      return res.status(400).json({
        message: `No email address for ${invoice.clientName}. Add an email to the client before sending.`,
      });
    }
    const team = currentUser.teamId ? await teamOps.findById(currentUser.teamId) : null;
    const branding =
      team?.organizationId
        ? await organizationOps.findById(team.organizationId)
        : null;
    let pdfBuffer = null;
    try {
      pdfBuffer = await buildInvoicePdf(invoice, branding || team);
    } catch (pdfErr) {
      console.error("[PDF] Failed to build invoice PDF:", pdfErr?.message || pdfErr);
    }
    const sent = await sendInvoiceEmail(
      clientEmail,
      invoice.clientName,
      invoice,
      branding,
      pdfBuffer
    );
    if (!sent) {
      return res.status(500).json({
        message: "Failed to send email. Check server email configuration (Resend or SMTP).",
      });
    }
    await invoiceOps.update(invoice.id, { status: "sent" });
    res.json({ message: `Invoice sent to ${clientEmail}.`, sentTo: clientEmail });
  } catch (error) {
    console.error("Error sending invoice:", error);
    res.status(500).json({ message: "Error sending invoice." });
  }
});

app.post("/api/billing/generate-drafts", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    if (!currentUser.teamId) {
      return res.status(400).json({ message: "No active team." });
    }
    const clientId =
      typeof req.body?.clientId === "string" && req.body.clientId.trim()
        ? req.body.clientId.trim()
        : null;
    const result = await generateDraftInvoicesForTeam(currentUser.teamId, { clientId });
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof ClientBillingError) {
      return res.status(error.code === "NOT_FOUND" ? 404 : 400).json({ message: error.message });
    }
    console.error("Error generating draft invoices:", error);
    res.status(500).json({ message: "Error generating draft invoices" });
  }
});

app.get("/api/invoices/:id/export.csv", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoice = await invoiceOps.findById(req.params.id);
    if (!invoice || invoice.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    const csv = buildInvoicesCsv([invoice]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="invoice-${invoice.invoiceNumber}.csv"`
    );
    res.send(csv);
  } catch (error) {
    console.error("Error exporting invoice CSV:", error);
    res.status(500).json({ message: "Error exporting invoice" });
  }
});

// ==================== TEAM & INVITE ROUTES ====================

// Get team property limit (no settings access required – used by Inventory page)
app.get("/api/team/limits", authenticateToken, async (req, res) => {
  try {
    const ctx = await ensureMembershipContext(req.user.id);
    if (!ctx?.team || !ctx.organization) {
      return res.status(404).json({ message: "Team not found for user" });
    }
    const effectivePlan = getEffectivePlan(ctx.organization);
    const planLimits = getPlanLimits(effectivePlan);
    const effectiveMaxUsers = getEffectiveMaxUsers(ctx.organization);
    res.json({
      effectiveMaxProperties: planLimits.maxProperties,
      effectiveMaxUsers,
      effectivePlan,
    });
  } catch (error) {
    console.error("Error fetching team limits:", error);
    res.status(500).json({ message: "Error fetching team limits" });
  }
});

app.get("/api/team/name", authenticateToken, async (req, res) => {
  try {
    const ctx = await ensureMembershipContext(req.user.id);
    if (!ctx?.user) {
      return res.status(404).json({ message: "Team not found for user" });
    }
    const name =
      ctx.team?.name?.trim() ||
      `${ctx.user.name || ctx.user.email.split("@")[0]}'s Team`;
    res.json({ name });
  } catch (error) {
    console.error("Error fetching team name:", error);
    res.status(500).json({ message: "Error fetching team name" });
  }
});

app.get("/api/team", authenticateToken, async (req, res) => {
  try {
    const ctx = await ensureMembershipContext(req.user.id);
    const user = ctx?.user;
    if (!user?.teamId || !ctx.team || !ctx.organization) {
      return res.status(404).json({ message: "Team not found for user" });
    }
    if (!userHasPageAccess(user, "settings")) {
      return res.status(403).json({ message: "You do not have access to Settings." });
    }

    const team = ctx.team;
    const org = ctx.organization;
    const membershipRows = await membershipOps.findAllByTeam(team.id);
    const currentUserId = req.user.id;
    const isOrgOwner = org.ownerId === user.id;
    const canSeeMemberPii = user.teamRole === "owner" || isOrgOwner;
    const membersFormatted = membershipRows.map((m) => {
      const u = m.user;
      const base = {
        id: u.id,
        teamRole: m.teamRole || (u.id === team.ownerId ? "owner" : "member"),
        maxInventoryItems: m.maxInventoryItems ?? null,
        allowedPages: m.allowedPages ?? null,
        allowedPropertyIds: m.allowedPropertyIds ?? null,
      };
      if (u.id === currentUserId || canSeeMemberPii) {
        return {
          ...base,
          email: u.email,
          name: u.name,
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
        };
      }
      return { ...base, isTeammate: true };
    });

    const invitations = await invitationOps.findAllByTeam(team.id);
    const invitationsFormatted = invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      teamRole: inv.teamRole,
      maxInventoryItems: inv.maxInventoryItems ?? null,
      status: inv.status,
      token: inv.token,
      createdAt: inv.createdAt,
      expiresAt: inv.expiresAt,
      allowedPages: inv.allowedPages ?? null,
      allowedPropertyIds: inv.allowedPropertyIds ?? null,
    }));

    const propertyCount = await propertyOps.countByTeam(team.id);
    const trialStatus = getTrialStatus(org);
    const effectivePlan = getEffectivePlan(org);
    const planLimits = getPlanLimits(effectivePlan);
    const effectiveMaxProperties = planLimits.maxProperties;
    const effectiveMaxUsers = getEffectiveMaxUsers(org);

    let invoiceStyle = null;
    if (org.invoiceStyle) {
      try {
        invoiceStyle =
          typeof org.invoiceStyle === "string" ? JSON.parse(org.invoiceStyle) : org.invoiceStyle;
      } catch (_) {}
    }

    const orgOwnerUser = org.ownerId ? await userOps.findById(org.ownerId) : null;
    const orgOwners = orgOwnerUser
      ? [
          {
            id: orgOwnerUser.id,
            name:
              orgOwnerUser.name ||
              [orgOwnerUser.firstName, orgOwnerUser.lastName].filter(Boolean).join(" ").trim() ||
              null,
            email: orgOwnerUser.email,
            firstName: orgOwnerUser.firstName ?? null,
            lastName: orgOwnerUser.lastName ?? null,
          },
        ]
      : [];

    const orgTeams = await teamOps.findAllByOrganization(org.id);
    const userMemberships = await membershipOps.findAllByUser(user.id);
    const membershipByTeamId = new Map(userMemberships.map((m) => [m.teamId, m]));
    const organizationTeams = [];
    for (const t of orgTeams) {
      const memberCount = await membershipOps.countByTeam(t.id);
      const myMembership = membershipByTeamId.get(t.id);
      organizationTeams.push({
        id: t.id,
        name: t.name,
        memberCount,
        isActive: t.id === team.id,
        isMember: Boolean(myMembership),
        myTeamRole: myMembership?.teamRole ?? null,
      });
    }

    res.json({
      team: {
        id: team.id,
        name: team.name,
        ownerId: team.ownerId,
        organizationId: org.id,
        organizationName: org.name,
        isOrgOwner,
        plan: org.plan || "free",
        effectivePlan,
        maxProperties: org.maxProperties,
        effectiveMaxProperties,
        extraUserSlots: org.extraUserSlots ?? 0,
        effectiveMaxUsers,
        propertyCount,
        billingInterval: org.billingInterval || null,
        isOnTrial: org.isOnTrial || false,
        trialEndsAt: org.trialEndsAt,
        trialStatus,
        billingPortalAvailable: Boolean(org.stripeCustomerId),
        invoiceLogoUrl: org.invoiceLogoUrl ?? null,
        invoiceStyle,
        billingTimezone: team.billingTimezone || "America/Toronto",
      },
      organization: {
        id: org.id,
        name: org.name,
        owners: orgOwners,
      },
      organizationTeams,
      members: membersFormatted,
      invitations: invitationsFormatted,
    });
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ message: "Error fetching team information" });
  }
});

// Update team name (team owner) and/or org invoice branding (org owner)
app.patch("/api/team", authenticateToken, async (req, res) => {
  try {
    const ctx = await ensureMembershipContext(req.user.id);
    const currentUser = ctx?.user;
    if (!currentUser?.teamId || !ctx.team || !ctx.organization) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }

    const teamUpdates = {};
    const orgUpdates = {};

    if (typeof req.body.name === "string" && req.body.name.trim()) {
      if (currentUser.teamRole !== "owner") {
        return res.status(403).json({ message: "Only team owners can rename the team" });
      }
      teamUpdates.name = req.body.name.trim();
    }

    if (typeof req.body.organizationName === "string" && req.body.organizationName.trim()) {
      if (!currentUser.isOrgOwner) {
        return res.status(403).json({ message: "Only the organization owner can rename the organization" });
      }
      orgUpdates.name = req.body.organizationName.trim();
    }

    if (req.body.invoiceLogoUrl !== undefined || req.body.invoiceStyle !== undefined) {
      if (!currentUser.isOrgOwner) {
        return res.status(403).json({ message: "Only the organization owner can update invoice branding" });
      }
      if (req.body.invoiceLogoUrl !== undefined) {
        orgUpdates.invoiceLogoUrl =
          req.body.invoiceLogoUrl == null || req.body.invoiceLogoUrl === ""
            ? null
            : String(req.body.invoiceLogoUrl).trim() || null;
      }
      if (req.body.invoiceStyle !== undefined) {
        orgUpdates.invoiceStyle =
          req.body.invoiceStyle == null
            ? null
            : typeof req.body.invoiceStyle === "string"
              ? req.body.invoiceStyle
              : JSON.stringify(req.body.invoiceStyle);
      }
    }

    if (typeof req.body.billingTimezone === "string" && req.body.billingTimezone.trim()) {
      if (currentUser.teamRole !== "owner") {
        return res.status(403).json({ message: "Only team owners can update billing timezone" });
      }
      teamUpdates.billingTimezone = req.body.billingTimezone.trim();
    }

    if (Object.keys(teamUpdates).length === 0 && Object.keys(orgUpdates).length === 0) {
      return res.status(400).json({ message: "No valid updates provided" });
    }

    if (Object.keys(teamUpdates).length > 0) {
      await teamOps.update(currentUser.teamId, teamUpdates);
    }
    if (Object.keys(orgUpdates).length > 0) {
      await organizationOps.update(ctx.organization.id, orgUpdates);
    }

    const updatedTeam = await teamOps.findById(currentUser.teamId);
    const updatedOrg = await organizationOps.findById(ctx.organization.id);
    let invoiceStyle = null;
    if (updatedOrg.invoiceStyle) {
      try {
        invoiceStyle =
          typeof updatedOrg.invoiceStyle === "string"
            ? JSON.parse(updatedOrg.invoiceStyle)
            : updatedOrg.invoiceStyle;
      } catch (_) {}
    }
    res.json({
      team: {
        id: updatedTeam.id,
        name: updatedTeam.name,
        billingTimezone: updatedTeam.billingTimezone || "America/Toronto",
        organizationId: updatedOrg.id,
        organizationName: updatedOrg.name,
        invoiceLogoUrl: updatedOrg.invoiceLogoUrl ?? null,
        invoiceStyle,
      },
      organization: {
        id: updatedOrg.id,
        name: updatedOrg.name,
      },
    });
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).json({ message: "Error updating team" });
  }
});

app.post("/api/team/invitations", authenticateToken, async (req, res) => {
  try {
    const {
      email,
      teamRole = "member",
      maxInventoryItems = null,
      allowedPages = null,
      allowedPropertyIds = null,
    } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const ctx = await ensureMembershipContext(req.user.id);
    const currentUser = ctx?.user;
    if (!currentUser?.teamId || !ctx.team || !ctx.organization) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (!userHasPageAccess(currentUser, "settings")) {
      return res.status(403).json({ message: "You do not have access to Settings." });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can invite new members" });
    }

    const team = ctx.team;
    const org = ctx.organization;
    const effectivePlan = getEffectivePlan(org);
    const effectiveMaxUsers = getEffectiveMaxUsers(org);
    if (effectiveMaxUsers !== null) {
      const memberCount = await membershipOps.countByTeam(currentUser.teamId);
      if (memberCount >= effectiveMaxUsers) {
        const msg =
          effectiveMaxUsers === 1
            ? "Free plan allows only 1 user. Upgrade to Starter or Pro to add team members."
            : effectivePlan === "starter"
              ? `Starter plan allows ${effectiveMaxUsers} users. You can add up to 2 extra users at $5/mo each in Settings.`
              : `Pro plan allows ${effectiveMaxUsers} users. You can add up to 3 extra users at $5/mo each in Settings.`;
        return res.status(403).json({ message: msg });
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const normalisedAllowedPages =
      Array.isArray(allowedPages) && allowedPages.length > 0 ? allowedPages : null;
    const normalisedAllowedPropertyIds =
      Array.isArray(allowedPropertyIds) && allowedPropertyIds.length > 0
        ? allowedPropertyIds
        : null;

    const invitation = await invitationOps.create({
      teamId: currentUser.teamId,
      email,
      teamRole,
      maxInventoryItems: typeof maxInventoryItems === "number" ? maxInventoryItems : null,
      allowedPages: normalisedAllowedPages,
      allowedPropertyIds: normalisedAllowedPropertyIds,
      status: "pending",
      token: crypto.randomUUID(),
      expiresAt,
      invitedByUserId: currentUser.id,
    });

    const teamName = team.name?.trim() || "the team";
    const inviterName = currentUser.name?.trim() || "A team owner";
    sendInvitationEmail(invitation.email, invitation.token, teamName, inviterName).catch((err) => {
      console.error("Failed to send invitation email:", err?.message || err);
    });

    res.status(201).json({
      id: invitation.id,
      email: invitation.email,
      teamRole: invitation.teamRole,
      maxInventoryItems: invitation.maxInventoryItems,
      status: invitation.status,
      token: invitation.token,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      allowedPages: invitation.allowedPages,
      allowedPropertyIds: invitation.allowedPropertyIds,
    });
  } catch (error) {
    console.error("Error creating invitation:", error);
    res.status(500).json({ message: "Error creating invitation" });
  }
});

app.post("/api/team/invitations/accept", authenticateToken, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ message: "Invitation token is required" });
    }

    const invitation = await invitationOps.findByToken(token);
    if (!invitation) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    if (invitation.status !== "pending") {
      return res.status(400).json({ message: "Invitation is no longer valid" });
    }

    const now = new Date();
    if (invitation.expiresAt && new Date(invitation.expiresAt) < now) {
      await invitationOps.update(invitation.id, { status: "expired" });
      return res.status(400).json({ message: "Invitation has expired" });
    }

    const rawUser = await userOps.findById(req.user.id);
    if (!rawUser) {
      return res.status(404).json({ message: "User not found" });
    }
    if (rawUser.email.toLowerCase() !== invitation.email.toLowerCase()) {
      return res.status(403).json({
        message:
          "This invitation was sent to a different email address. Sign in with the email that received the invite.",
      });
    }

    await membershipOps.upsertForUserTeam(rawUser.id, invitation.teamId, {
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

    if (!rawUser.activeTeamId) {
      await userOps.update(rawUser.id, { activeTeamId: invitation.teamId });
    } else {
      await userOps.update(rawUser.id, { activeTeamId: invitation.teamId });
    }

    await invitationOps.update(invitation.id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: rawUser.id,
    });

    const ctx = await ensureMembershipContext(rawUser.id);
    res.json({
      message: "Invitation accepted successfully",
      user: buildAuthUserPayload(ctx),
      teamId: invitation.teamId,
      teamRole: invitation.teamRole || "member",
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ message: "Error accepting invitation" });
  }
});

app.patch("/api/team/members/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can edit members" });
    }
    const targetUserId = req.params.userId;
    if (targetUserId === currentUser.id) {
      return res.status(400).json({ message: "You cannot edit your own role from here" });
    }
    const membership = await membershipOps.findByUserAndTeam(targetUserId, currentUser.teamId);
    if (!membership) {
      return res.status(404).json({ message: "Member not found in your team" });
    }
    const { teamRole, maxInventoryItems, allowedPages, allowedPropertyIds } = req.body || {};
    const updates = {};
    if (teamRole === "member" || teamRole === "viewer") updates.teamRole = teamRole;
    if (typeof maxInventoryItems === "number" || maxInventoryItems === null) {
      updates.maxInventoryItems = maxInventoryItems;
    }
    if (Array.isArray(allowedPages)) updates.allowedPages = allowedPages;
    if (Array.isArray(allowedPropertyIds)) updates.allowedPropertyIds = allowedPropertyIds;
    const updated = await membershipOps.update(membership.id, updates);
    const targetUser = await userOps.findById(targetUserId);
    res.json({
      id: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      teamRole: updated.teamRole,
      maxInventoryItems: updated.maxInventoryItems ?? null,
      allowedPages: updated.allowedPages ?? null,
      allowedPropertyIds: updated.allowedPropertyIds ?? null,
    });
  } catch (error) {
    console.error("Error updating member:", error);
    res.status(500).json({ message: "Error updating member" });
  }
});

app.delete("/api/team/members/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can remove members" });
    }
    const targetUserId = req.params.userId;
    if (targetUserId === currentUser.id) {
      return res.status(400).json({ message: "You cannot remove yourself from the team" });
    }
    const membership = await membershipOps.findByUserAndTeam(targetUserId, currentUser.teamId);
    if (!membership) {
      return res.status(404).json({ message: "Member not found in your team" });
    }
    await membershipOps.deleteByUserAndTeam(targetUserId, currentUser.teamId);
    const target = await userOps.findById(targetUserId);
    if (target?.activeTeamId === currentUser.teamId) {
      const remaining = await membershipOps.findAllByUser(targetUserId);
      await userOps.update(targetUserId, {
        activeTeamId: remaining[0]?.teamId ?? null,
      });
    }
    res.json({ message: "Member removed from team" });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ message: "Error removing member" });
  }
});

app.patch("/api/team/invitations/:invitationId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can edit invitations" });
    }
    const invitation = await invitationOps.findById(req.params.invitationId);
    if (!invitation || invitation.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    if (invitation.status !== "pending") {
      return res.status(400).json({ message: "Only pending invitations can be edited" });
    }
    const { teamRole, maxInventoryItems, allowedPages, allowedPropertyIds } = req.body || {};
    const updates = {};
    if (teamRole === "member" || teamRole === "viewer" || teamRole === "owner") updates.teamRole = teamRole;
    if (typeof maxInventoryItems === "number" || maxInventoryItems === null) updates.maxInventoryItems = maxInventoryItems;
    if (Array.isArray(allowedPages)) updates.allowedPages = allowedPages;
    if (Array.isArray(allowedPropertyIds)) updates.allowedPropertyIds = allowedPropertyIds;
    const updated = await invitationOps.update(invitation.id, updates);
    res.json({
      id: updated.id,
      email: updated.email,
      teamRole: updated.teamRole,
      maxInventoryItems: updated.maxInventoryItems ?? null,
      status: updated.status,
      allowedPages: updated.allowedPages ?? null,
      allowedPropertyIds: updated.allowedPropertyIds ?? null,
    });
  } catch (error) {
    console.error("Error updating invitation:", error);
    res.status(500).json({ message: "Error updating invitation" });
  }
});

app.delete("/api/team/invitations/:invitationId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can revoke invitations" });
    }
    const invitation = await invitationOps.findById(req.params.invitationId);
    if (!invitation || invitation.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    await invitationOps.delete(invitation.id);
    res.json({ message: "Invitation revoked" });
  } catch (error) {
    console.error("Error deleting invitation:", error);
    res.status(500).json({ message: "Error deleting invitation" });
  }
});

const TRIAL_CHECK_INTERVAL = 60 * 60 * 1000;

async function checkAndDowngradeTrials() {
  try {
    console.log("[TRIAL] Checking for expired trials...");
    const downgraded = await downgradeExpiredTrials();
    if (downgraded > 0) {
      console.log(`[TRIAL] Successfully downgraded ${downgraded} expired trial(s)`);
    }
  } catch (error) {
    console.error("[TRIAL] Error checking expired trials:", error);
  }
}

checkAndDowngradeTrials();
setInterval(checkAndDowngradeTrials, TRIAL_CHECK_INTERVAL);
console.log(`[TRIAL] Scheduled trial checks every ${TRIAL_CHECK_INTERVAL / 1000 / 60} minutes`);

const BILLING_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

async function runScheduledClientBilling() {
  try {
    console.log("[BILLING] Generating draft invoices for due periods...");
    const result = await generateDraftInvoicesForAllTeams();
    console.log(
      `[BILLING] Done — ${result.invoicesCreated} draft(s) across ${result.teams} team(s)`
    );
  } catch (error) {
    console.error("[BILLING] Error generating drafts:", error);
  }
}

// Delay first run so the server finishes booting; then daily
setTimeout(runScheduledClientBilling, 60 * 1000);
setInterval(runScheduledClientBilling, BILLING_CHECK_INTERVAL);
console.log(`[BILLING] Scheduled draft generation every ${BILLING_CHECK_INTERVAL / 1000 / 60 / 60} hours`);

app.post("/api/team/start-trial", authenticateToken, async (req, res) => {
  try {
    const user = await loadCurrentUser(req);
    if (!user?.organizationId) {
      return res.status(404).json({ message: "Organization not found for user" });
    }
    if (!user.isOrgOwner) {
      return res.status(403).json({ message: "Only the organization owner can start trials" });
    }

    const org = await organizationOps.findById(user.organizationId);
    if (!org) {
      return res.status(404).json({ message: "Organization not found" });
    }
    if (org.isOnTrial) {
      return res.status(400).json({ message: "Organization is already on a trial" });
    }
    if (org.plan !== "free") {
      return res.status(400).json({ message: "Trials are only available for free plan organizations" });
    }

    const plan = req.body?.plan === "starter" ? "starter" : "pro";
    const updatedOrg =
      plan === "starter" ? await startStarterTrial(org.id) : await startProTrial(org.id);
    const trialStatus = getTrialStatus(updatedOrg);

    res.json({
      message: `14-day ${plan === "starter" ? "Starter" : "Pro"} trial started successfully!`,
      trial: trialStatus,
      team: {
        plan: updatedOrg.plan,
        effectivePlan: getEffectivePlan(updatedOrg),
        maxProperties: updatedOrg.maxProperties,
      },
    });
  } catch (error) {
    console.error("Error starting trial:", error);
    res.status(500).json({ message: "Error starting trial" });
  }
});

// Start server (bind to 0.0.0.0 so Railway can reach the process)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📝 API available at http://localhost:${PORT}/api`);
  console.log(`🌍 APP_ENV=${appEnv}`);
});
