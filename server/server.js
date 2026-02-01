import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
  initDemoUser,
  userOps,
  teamOps,
  warehouseOps,
  inventoryOps,
  clientOps,
  invoiceOps,
  saleOps,
  invitationOps,
  passwordResetTokenOps,
  prisma,
} from "./db.js";
import { sendVerificationEmail, sendInvoiceEmail } from "./email.js";
import {
  startProTrial,
  isTrialExpired,
  getEffectivePlan,
  getPlanLimits,
  canCreateWarehouse,
  downgradeExpiredTrials,
  getTrialStatus,
  startStarterTrial,
} from "./trialManager.js";
import {
  createCheckoutSession,
  createCustomerPortalSession,
  ensureTeamStripeCustomer,
  handleWebhook,
  isBillingConfigured,
} from "./billing.js";

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

// Trust proxy so rate limiting works behind Railway/load balancers (fixes ERR_ERL_UNEXPECTED_X_FORWARDED_FOR)
app.set("trust proxy", 1);

// Require JWT_SECRET in production – never use default secret when deployed
if (isProduction && !process.env.JWT_SECRET) {
  console.error("FATAL: JWT_SECRET must be set in production. Set it in your environment.");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
// CORS: single origin or comma-separated list (e.g. https://stockstay.com,https://stockstay.ca)
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const corsOrigins = CORS_ORIGIN
  ? CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : [];

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
  res.status(200).json({ status: "ok", service: "StockStay API", docs: "/api/health" });
});

// Security: secure headers
app.use(helmet());

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

// Initialize demo user and team if no users exist
initDemoUser().catch((err) => {
  console.error("Error initializing demo user:", err);
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

    console.log(`[LOGIN] Attempting login for: ${email}`);
    let user = await userOps.findByEmail(email);
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
    const isPasswordValid = rawPassword && (await bcrypt.compare(rawPassword, user.password));
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid credentials. If you've forgotten your password, use Forgot password below.",
      });
    }

    // Ensure legacy users get sensible defaults (non-blocking: login still succeeds if this fails)
    const updates = {};
    if (!user.teamId) {
      updates.teamId = crypto.randomUUID();
      updates.teamRole = "owner";
    }
    if (!user.teamRole) updates.teamRole = "owner";
    if (typeof user.allowedPages === "undefined") updates.allowedPages = null;
    if (typeof user.allowedWarehouseIds === "undefined") updates.allowedWarehouseIds = null;

    if (Object.keys(updates).length > 0) {
      try {
        if (updates.teamId && !user.teamId) {
          await teamOps.create({
            id: updates.teamId,
            name: `${user.name || user.email.split("@")[0]}'s Team`,
            ownerId: user.id,
          });
        }
        user = await userOps.update(user.id, updates);
      } catch (legacyErr) {
        console.warn("Login: legacy user update failed (continuing with existing user):", legacyErr.message);
      }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    let teamName = null;
    if (user.teamId) {
      const team = await teamOps.findById(user.teamId);
      teamName = team?.name?.trim() || `${user.name || user.email.split("@")[0]}'s Team`;
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        address: user.address ?? "",
        streetAddress: user.streetAddress ?? "",
        city: user.city ?? "",
        province: user.province ?? "",
        postalCode: user.postalCode ?? "",
        phone: user.phone ?? "",
        teamId: user.teamId,
        teamName: teamName ?? null,
        teamRole: user.teamRole,
        maxInventoryItems: user.maxInventoryItems ?? null,
        allowedPages: user.allowedPages ?? null,
        allowedWarehouseIds: user.allowedWarehouseIds ?? null,
      },
      token,
    });
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
  body("address").optional().trim(),
  body("phoneNumber").optional().trim(),
  body("startProTrial").optional().toBoolean(),
];

app.post("/api/auth/signup", signupRateLimiter, signupValidation, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const firstError = errors.array()[0];
      return res.status(400).json({ message: firstError.msg || "Validation failed" });
    }

    const { email, password, fullName, address, phoneNumber, startProTrial: wantsProTrial } = req.body;

    const existing = await userOps.findByEmail(email);
    if (existing) {
      return res.status(400).json({ message: "An account with this email already exists. Sign in or use a different email." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const teamId = crypto.randomUUID();
    const newUserId = crypto.randomUUID();
    const verificationToken = crypto.randomUUID();
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create team (with or without trial)
    const teamData = {
      id: teamId,
      name: `${fullName}'s Team`,
      ownerId: newUserId,
    };

    await teamOps.create(teamData);

    // Start Pro trial if requested
    if (wantsProTrial === true) {
      await startProTrial(teamId);
      console.log(`[TRIAL] Started 14-day Pro trial for new team ${teamId}`);
    }

    const user = await userOps.create({
      id: newUserId,
      email,
      name: fullName.trim(),
      password: hashedPassword,
      address: (address || "").trim() || null,
      phone: (phoneNumber || "").trim() || null,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpiresAt: verificationExpiresAt,
      teamId,
      teamRole: "owner",
      maxInventoryItems: null,
      allowedPages: null,
      allowedWarehouseIds: null,
    });

    await sendVerificationEmail(email, verificationToken, fullName.trim());

    const responseMessage = wantsProTrial === true
      ? "Account created with 14-day Pro trial! Please check your email to verify your address before signing in."
      : "Account created. Please check your email to verify your address before signing in.";

    let checkoutUrl = null;
    if (wantsProTrial === true && isBillingConfigured()) {
      try {
        const base = (process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
        const { url } = await createCheckoutSession({
          teamId,
          customerEmail: email,
          successUrl: `${base}/login?trial_started=1`,
          cancelUrl: `${base}/login?mode=signup&checkout=cancelled`,
          plan: "pro",
          billingPeriod: "monthly",
          stripeTrialDays: 14,
        });
        checkoutUrl = url;
      } catch (billingErr) {
        console.error("Signup: could not create trial checkout session:", billingErr);
        // Still return success; they have the app trial, they can add card later from Settings
      }
    }

    res.status(201).json({
      message: responseMessage,
      ...(checkoutUrl && { checkoutUrl }),
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
    let user = await userOps.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Ensure legacy users have team/role defaults
    const updates = {};
    if (!user.teamId) {
      const teamId = crypto.randomUUID();
      await teamOps.create({
        id: teamId,
        name: `${user.name || user.email.split("@")[0]}'s Team`,
        ownerId: user.id,
      });
      updates.teamId = teamId;
    }
    if (!user.teamRole) {
      updates.teamRole = "owner";
    }
    if (typeof user.allowedPages === "undefined") {
      updates.allowedPages = null;
    }
    if (typeof user.allowedWarehouseIds === "undefined") {
      updates.allowedWarehouseIds = null;
    }

    if (Object.keys(updates).length > 0) {
      user = await userOps.update(user.id, updates);
    }

    let teamName = null;
    if (user.teamId) {
      const team = await teamOps.findById(user.teamId);
      teamName = team?.name?.trim() || `${user.name || user.email.split("@")[0]}'s Team`;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      address: user.address ?? "",
      streetAddress: user.streetAddress ?? "",
      city: user.city ?? "",
      province: user.province ?? "",
      postalCode: user.postalCode ?? "",
      phone: user.phone ?? "",
      teamId: user.teamId,
      teamName: teamName ?? null,
      teamRole: user.teamRole,
      maxInventoryItems: user.maxInventoryItems ?? null,
      allowedPages: user.allowedPages ?? null,
      allowedWarehouseIds: user.allowedWarehouseIds ?? null,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.patch("/api/auth/profile", authenticateToken, async (req, res) => {
  try {
    const user = await userOps.findById(req.user.id);
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
    const updated = await userOps.update(user.id, updates);
    let teamName = null;
    if (updated.teamId) {
      const team = await teamOps.findById(updated.teamId);
      teamName = team?.name?.trim() || null;
    }
    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      firstName: updated.firstName ?? "",
      lastName: updated.lastName ?? "",
      address: updated.address ?? "",
      streetAddress: updated.streetAddress ?? "",
      city: updated.city ?? "",
      province: updated.province ?? "",
      postalCode: updated.postalCode ?? "",
      phone: updated.phone ?? "",
      teamId: updated.teamId,
      teamName: teamName ?? null,
      teamRole: updated.teamRole,
      maxInventoryItems: updated.maxInventoryItems ?? null,
      allowedPages: updated.allowedPages ?? null,
      allowedWarehouseIds: updated.allowedWarehouseIds ?? null,
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: "Error updating profile" });
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

// ==================== WAREHOUSE ROUTES ====================

// Get current team's warehouses
app.get("/api/warehouses", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }

    const warehouses = await warehouseOps.findAllByTeam(currentUser.teamId);
    res.json(warehouses);
  } catch (error) {
    console.error("Error fetching warehouses:", error);
    res.status(500).json({ message: "Error fetching warehouses" });
  }
});

// Create a new warehouse for the current team,
// enforcing plan-based maxWarehouses limits.
app.post("/api/warehouses", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "User does not belong to a team." });
    }

    // Only owners can create warehouses (simple rule for now)
    if (currentUser.teamRole !== "owner") {
      return res
        .status(403)
        .json({ message: "Only team owners can create warehouses." });
    }

    const team = await teamOps.findById(currentUser.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found." });
    }

    // Check if trial has expired and downgrade if needed
    if (team.isOnTrial && isTrialExpired(team)) {
      await prisma.team.update({
        where: { id: team.id },
        data: {
          plan: 'free',
          isOnTrial: false,
          trialEndsAt: null,
          trialPlan: null,
          maxWarehouses: 1,
        },
      });
      team.plan = 'free';
      team.isOnTrial = false;
      team.maxWarehouses = 1;
      console.log(`[TRIAL] Auto-downgraded team ${team.id} from expired trial`);
    }

    // Use trial manager to check warehouse limits
    const currentCount = await warehouseOps.countByTeam(team.id);
    const warehouseCheck = canCreateWarehouse(team, currentCount);

    if (!warehouseCheck.canCreate) {
      const effectivePlan = getEffectivePlan(team);
      return res.status(403).json({
        message:
          effectivePlan === "free"
            ? "Free plan allows only 1 warehouse. Upgrade your plan to add more."
            : `Warehouse limit reached for your current plan (${warehouseCheck.limit} max).`,
        limit: warehouseCheck.limit,
        current: warehouseCheck.current,
        plan: warehouseCheck.plan,
        upgradeAvailable: true,
      });
    }

    const { name, location } = req.body;
    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Warehouse name is required." });
    }

    const warehouse = await warehouseOps.createForTeam(currentUser.teamId, {
      name,
      location,
    });

    res.status(201).json(warehouse);
  } catch (error) {
    console.error("Error creating warehouse:", error);
    res.status(500).json({ message: "Error creating warehouse" });
  }
});

app.put("/api/warehouses/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "You do not belong to a team." });
    }
    const teamWarehouses = await warehouseOps.findAllByTeam(currentUser.teamId);
    const warehouse = teamWarehouses.find((w) => w.id === req.params.id);
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found." });
    }
    const { name, location } = req.body;
    const updated = await warehouseOps.update(req.params.id, {
      name: typeof name === "string" ? name : warehouse.name,
      location: typeof location === "string" ? location : warehouse.location ?? "",
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating warehouse:", error);
    res.status(500).json({ message: "Error updating warehouse" });
  }
});

app.delete("/api/warehouses/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "You do not belong to a team." });
    }
    const teamWarehouses = await warehouseOps.findAllByTeam(currentUser.teamId);
    const warehouse = teamWarehouses.find((w) => w.id === req.params.id);
    if (!warehouse) {
      return res.status(404).json({ message: "Warehouse not found." });
    }
    await warehouseOps.delete(req.params.id);
    res.json({ message: "Warehouse deleted successfully" });
  } catch (error) {
    console.error("Error deleting warehouse:", error);
    res.status(500).json({ message: "Error deleting warehouse" });
  }
});

// ==================== BILLING (STRIPE) ROUTES ====================

const APP_URL = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";

app.post("/api/billing/create-checkout-session", authenticateToken, async (req, res) => {
  try {
    if (!isBillingConfigured()) {
      return res.status(503).json({ message: "Billing is not configured. Contact support." });
    }
    const currentUser = await userOps.findById(req.user.id);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "You must belong to a team to upgrade." });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can manage billing." });
    }
    const base = (APP_URL || "").replace(/\/$/, "");
    const successUrl = req.body.successUrl || `${base}/dashboard?checkout=success`;
    const cancelUrl = req.body.cancelUrl || `${base}/pricing?checkout=cancelled`;
    const plan = req.body.plan === "starter" ? "starter" : "pro";
    const billingPeriod = req.body.billingPeriod === "annual" ? "annual" : "monthly";
    const stripeTrialDays = typeof req.body.stripeTrialDays === "number" ? req.body.stripeTrialDays : 14;
    const { url } = await createCheckoutSession({
      teamId: currentUser.teamId,
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
    const currentUser = await userOps.findById(req.user.id);
    if (!currentUser?.teamId) {
      return res.status(400).json({ message: "You must belong to a team." });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can manage billing." });
    }
    const teamId = currentUser.teamId;
    const customerId = await ensureTeamStripeCustomer(teamId, currentUser.email);
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

// ==================== INVENTORY ROUTES ====================

app.get("/api/inventory", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    // Only return items in this user's team's warehouses (not all items in the DB)
    const teamWarehouseIds =
      currentUser?.teamId ?
        (await warehouseOps.findAllByTeam(currentUser.teamId)).map((w) => w.id)
      : [];
    let items = await inventoryOps.findAll(teamWarehouseIds);

    // If the user has warehouse restrictions, only return items from allowed warehouses
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0
    ) {
      items = items.filter(
        (item) =>
          item.warehouseId &&
          currentUser.allowedWarehouseIds.includes(item.warehouseId)
      );
    }

    res.json(items);
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ message: "Error fetching inventory" });
  }
});

// Helper: item is in one of the current user's team's warehouses
async function inventoryItemBelongsToTeam(item, currentUser) {
  if (!currentUser?.teamId || !item?.warehouseId) return false;
  const warehouses = await warehouseOps.findAllByTeam(currentUser.teamId);
  return warehouses.some((w) => w.id === item.warehouseId);
}

app.get("/api/inventory/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    const item = await inventoryOps.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Item must be in this user's team's warehouses
    if (!(await inventoryItemBelongsToTeam(item, currentUser))) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Enforce warehouse-level restrictions (allowedWarehouseIds)
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0 &&
      (!item.warehouseId ||
        !currentUser.allowedWarehouseIds.includes(item.warehouseId))
    ) {
      return res.status(404).json({ message: "Item not found" });
    }

    res.json(item);
  } catch (error) {
    console.error("Error fetching item:", error);
    res.status(500).json({ message: "Error fetching item" });
  }
});

app.post("/api/inventory", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    // Team-scoped limit: only count items in this team's warehouses
    const teamWarehouseIds =
      currentUser?.teamId ?
        (await warehouseOps.findAllByTeam(currentUser.teamId)).map((w) => w.id)
      : [];
    const inventoryCount = await inventoryOps.countByWarehouseIds(teamWarehouseIds);
    if (
      currentUser &&
      typeof currentUser.maxInventoryItems === "number" &&
      inventoryCount >= currentUser.maxInventoryItems
    ) {
      return res.status(403).json({
        message: `Inventory item limit reached (${currentUser.maxInventoryItems}).`,
      });
    }

    // New item must be in one of this team's warehouses
    const warehouseId = req.body.warehouseId;
    if (warehouseId && teamWarehouseIds.length > 0 && !teamWarehouseIds.includes(warehouseId)) {
      return res.status(403).json({
        message: "You can only add items to warehouses in your team.",
      });
    }

    // Warehouse-level restrictions – user can only create items in allowed warehouses
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0
    ) {
      if (
        !warehouseId ||
        !currentUser.allowedWarehouseIds.includes(warehouseId)
      ) {
        return res.status(403).json({
          message: "You are not allowed to use this warehouse for new items.",
        });
      }
    }

    const name = req.body.name;
    const sku = req.body.sku != null ? req.body.sku : "";
    const existing = warehouseId
      ? await inventoryOps.findInWarehouseByNameAndSku(warehouseId, name, sku)
      : null;

    let item;
    if (existing) {
      const addQty = Number(req.body.quantity) || 0;
      item = await inventoryOps.update(existing.id, {
        quantity: existing.quantity + addQty,
      });
    } else {
      item = await inventoryOps.create({
        ...req.body,
      });
    }

    res.status(201).json(item);
  } catch (error) {
    console.error("Error creating item:", error);
    res.status(500).json({ message: "Error creating item" });
  }
});

app.post("/api/inventory/bulk", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    const teamWarehouseIds =
      currentUser?.teamId ?
        (await warehouseOps.findAllByTeam(currentUser.teamId)).map((w) => w.id)
      : [];
    const incomingCount = Array.isArray(req.body.items) ? req.body.items.length : 0;
    const inventoryCount = await inventoryOps.countByWarehouseIds(teamWarehouseIds);

    if (
      currentUser &&
      typeof currentUser.maxInventoryItems === "number" &&
      inventoryCount + incomingCount > currentUser.maxInventoryItems
    ) {
      return res.status(403).json({
        message: `Bulk import would exceed your inventory item limit (${currentUser.maxInventoryItems}).`,
      });
    }

    // Bulk items must be in this team's warehouses
    if (Array.isArray(req.body.items) && teamWarehouseIds.length > 0) {
      const invalidItem = req.body.items.find(
        (item) =>
          !item.warehouseId || !teamWarehouseIds.includes(item.warehouseId)
      );
      if (invalidItem) {
        return res.status(403).json({
          message: "Bulk import includes warehouses that are not in your team.",
        });
      }
    }

    // Ensure all imported items stay within allowed warehouses (if restricted)
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0 &&
      Array.isArray(req.body.items)
    ) {
      const invalidItem = req.body.items.find(
        (item) =>
          !item.warehouseId ||
          !currentUser.allowedWarehouseIds.includes(item.warehouseId)
      );
      if (invalidItem) {
        return res.status(403).json({
          message:
            "Bulk import includes items for warehouses you are not allowed to access.",
        });
      }
    }

    const items = await Promise.all(
      req.body.items.map(async (item) => {
        const whId = item.warehouseId;
        const name = item.name;
        const sku = item.sku != null ? item.sku : "";
        const existing = whId
          ? await inventoryOps.findInWarehouseByNameAndSku(whId, name, sku)
          : null;
        if (existing) {
          const addQty = Number(item.quantity) || 0;
          return inventoryOps.update(existing.id, {
            quantity: existing.quantity + addQty,
          });
        }
        return inventoryOps.create(item);
      })
    );

    res.status(201).json(items);
  } catch (error) {
    console.error("Error creating items:", error);
    res.status(500).json({ message: "Error creating items" });
  }
});

app.put("/api/inventory/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    const existingItem = await inventoryOps.findById(req.params.id);

    if (!existingItem) {
      return res.status(404).json({ message: "Item not found" });
    }

    if (!(await inventoryItemBelongsToTeam(existingItem, currentUser))) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Enforce warehouse-level restrictions for updates
    if (
      currentUser &&
      Array.isArray(currentUser.allowedWarehouseIds) &&
      currentUser.allowedWarehouseIds.length > 0
    ) {
      const targetWarehouseId =
        typeof req.body.warehouseId !== "undefined"
          ? req.body.warehouseId
          : existingItem.warehouseId;

      if (
        !targetWarehouseId ||
        !currentUser.allowedWarehouseIds.includes(targetWarehouseId)
      ) {
        return res.status(403).json({
          message: "You are not allowed to modify items in this warehouse.",
        });
      }
    }

    const updatedItem = await inventoryOps.update(req.params.id, req.body);
    res.json(updatedItem);
  } catch (error) {
    console.error("Error updating item:", error);
    res.status(500).json({ message: "Error updating item" });
  }
});

app.delete("/api/inventory/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    const item = await inventoryOps.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ message: "Item not found" });
    }
    if (!(await inventoryItemBelongsToTeam(item, currentUser))) {
      return res.status(404).json({ message: "Item not found" });
    }

    await inventoryOps.delete(req.params.id);
    res.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Error deleting item:", error);
    res.status(500).json({ message: "Error deleting item" });
  }
});

app.delete("/api/inventory", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    const teamWarehouseIds =
      currentUser?.teamId ?
        (await warehouseOps.findAllByTeam(currentUser.teamId)).map((w) => w.id)
      : [];
    const result = await inventoryOps.deleteByWarehouseIds(teamWarehouseIds);
    res.json({
      message: `Deleted ${result.count ?? 0} item(s) from your team's inventory.`,
    });
  } catch (error) {
    console.error("Error clearing inventory:", error);
    res.status(500).json({ message: "Error clearing inventory" });
  }
});

app.post("/api/inventory/transfer", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    if (!userHasPageAccess(currentUser, "inventory")) {
      return res.status(403).json({ message: "You do not have access to Inventory." });
    }

    const { fromWarehouseId, toWarehouseId, inventoryItemId, quantity } = req.body || {};
    if (!fromWarehouseId || !toWarehouseId || !inventoryItemId || typeof quantity !== "number" || quantity <= 0) {
      return res.status(400).json({ message: "Invalid transfer request. Provide fromWarehouseId, toWarehouseId, inventoryItemId, and quantity." });
    }

    if (fromWarehouseId === toWarehouseId) {
      return res.status(400).json({ message: "From and To warehouses must be different." });
    }

    const teamWarehouses = await warehouseOps.findAllByTeam(currentUser.teamId);
    const teamWarehouseIds = new Set(teamWarehouses.map((w) => w.id));
    if (!teamWarehouseIds.has(fromWarehouseId) || !teamWarehouseIds.has(toWarehouseId)) {
      return res.status(403).json({ message: "Warehouses not found or access denied." });
    }

    const sourceItem = await inventoryOps.findById(inventoryItemId);
    if (!sourceItem) {
      return res.status(404).json({ message: "Item not found." });
    }
    if (sourceItem.warehouseId !== fromWarehouseId) {
      return res.status(400).json({ message: "Item is not in the selected source warehouse." });
    }
    if (sourceItem.quantity < quantity) {
      return res.status(400).json({ message: `Insufficient stock. Available: ${sourceItem.quantity}` });
    }

    const itemsInToWarehouse = await prisma.inventory.findMany({
      where: { warehouseId: toWarehouseId },
    });
    const existingInDest = itemsInToWarehouse.find(
      (i) => i.name === sourceItem.name && (i.sku || "") === (sourceItem.sku || "")
    );

    if (existingInDest) {
      await inventoryOps.update(existingInDest.id, {
        quantity: existingInDest.quantity + quantity,
      });
    } else {
      await inventoryOps.create({
        name: sourceItem.name,
        sku: sourceItem.sku || "",
        category: sourceItem.category || "",
        location: sourceItem.location || "",
        warehouseId: toWarehouseId,
        quantity,
        unit: sourceItem.unit || "",
        reorderPoint: sourceItem.reorderPoint ?? 0,
        priceBoughtFor: sourceItem.priceBoughtFor ?? null,
        markupPercentage: sourceItem.markupPercentage ?? null,
        finalPrice: sourceItem.finalPrice ?? null,
        tags: sourceItem.tags || [],
        notes: sourceItem.notes || "",
      });
    }

    const newSourceQty = sourceItem.quantity - quantity;
    await inventoryOps.update(inventoryItemId, { quantity: newSourceQty });

    res.json({ message: `Transferred ${quantity} ${sourceItem.unit || "units"} of ${sourceItem.name} successfully.` });
  } catch (error) {
    console.error("Transfer error:", error);
    res.status(500).json({ message: "Transfer failed" });
  }
});

// ==================== CLIENTS ROUTES ====================

app.get("/api/clients", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "clients")) {
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
    const currentUser = await userOps.findById(req.user.id);

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
    const currentUser = await userOps.findById(req.user.id);

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
    const currentUser = await userOps.findById(req.user.id);

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
    const currentUser = await userOps.findById(req.user.id);

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
    const currentUser = await userOps.findById(req.user.id);

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

app.get("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

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
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "invoices")) {
      return res.status(403).json({ message: "You do not have access to Invoices." });
    }
    const invoiceData = req.body;

    // If invoice items are linked to inventory, validate and update stock
    if (invoiceData.items && Array.isArray(invoiceData.items)) {
      // Validate inventory availability
      for (const item of invoiceData.items) {
        if (!item.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(item.inventoryItemId);
        if (!inventoryItem) {
          return res.status(400).json({
            message: `Inventory item ${item.name || item.inventoryItemId} not found`,
          });
        }
        if (item.quantity > inventoryItem.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`,
          });
        }
      }

      // Deduct quantities from inventory
      for (const item of invoiceData.items) {
        if (!item.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(item.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(item.inventoryItemId, {
            quantity: inventoryItem.quantity - item.quantity,
          });
        }
      }
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
    const currentUser = await userOps.findById(req.user.id);

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

    const invoiceData = req.body;

    // If items are being updated and contain inventory-linked lines, adjust stock
    if (
      invoiceData.items &&
      Array.isArray(invoiceData.items) &&
      JSON.stringify(invoiceData.items) !== JSON.stringify(existingInvoice.items)
    ) {
      // First restore inventory for old items that were linked to inventory
      for (const oldItem of existingInvoice.items || []) {
        if (!oldItem.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(oldItem.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(oldItem.inventoryItemId, {
            quantity: inventoryItem.quantity + oldItem.quantity,
          });
        }
      }

      // Validate new items
      for (const item of invoiceData.items) {
        if (!item.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(item.inventoryItemId);
        if (!inventoryItem) {
          // Restore old quantities
          for (const oldItem of existingInvoice.items || []) {
            if (!oldItem.inventoryItemId) continue;
            const invItem = await inventoryOps.findById(oldItem.inventoryItemId);
            if (invItem) {
              await inventoryOps.update(oldItem.inventoryItemId, {
                quantity: invItem.quantity - oldItem.quantity,
              });
            }
          }
          return res.status(400).json({
            message: `Inventory item ${item.name || item.inventoryItemId} not found`,
          });
        }
        if (item.quantity > inventoryItem.quantity) {
          // Restore old quantities
          for (const oldItem of existingInvoice.items || []) {
            if (!oldItem.inventoryItemId) continue;
            const invItem = await inventoryOps.findById(oldItem.inventoryItemId);
            if (invItem) {
              await inventoryOps.update(oldItem.inventoryItemId, {
                quantity: invItem.quantity - oldItem.quantity,
              });
            }
          }
          return res.status(400).json({
            message: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`,
          });
        }
      }

      // Apply new quantities
      for (const item of invoiceData.items) {
        if (!item.inventoryItemId) continue;
        const inventoryItem = await inventoryOps.findById(item.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(item.inventoryItemId, {
            quantity: inventoryItem.quantity - item.quantity,
          });
        }
      }
    }

    const updatedInvoice = await invoiceOps.update(req.params.id, invoiceData);
    res.json(updatedInvoice);
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({ message: "Error updating invoice" });
  }
});

app.delete("/api/invoices/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

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
    const currentUser = await userOps.findById(req.user.id);
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
    const sent = await sendInvoiceEmail(clientEmail, invoice.clientName, invoice, team);
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

// ==================== SALES ROUTES ====================

// Build invoice payload from a single sale (for one active invoice per sale)
function buildInvoiceFromSale(sale, saleId = null) {
  const saleNumber = sale.saleNumber != null && String(sale.saleNumber).trim() !== "" ? String(sale.saleNumber) : "0";
  const invoiceItems = (sale.items || []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    name: item.inventoryItemName || item.name || "Item",
    quantity: Number(item.quantity) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    total: (Number(item.total) ?? Number(item.quantity) * Number(item.unitPrice)) || 0,
    inventoryItemId: item.inventoryItemId,
    sku: item.sku,
  }));
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const dateStr = sale.date && String(sale.date).trim() ? String(sale.date).trim() : new Date().toISOString().split("T")[0];
  const subtotal = Number(sale.subtotal) ?? 0;
  const tax = Number(sale.tax) ?? 0;
  const total = Number(sale.total) ?? 0;
  return {
    invoiceNumber: `INV-SALE-${saleNumber}`,
    clientId: sale.clientId || null,
    clientName: (sale.clientName && String(sale.clientName).trim()) ? String(sale.clientName).trim() : "",
    date: dateStr,
    dueDate,
    items: invoiceItems,
    subtotal,
    tax,
    total,
    status: "draft",
    notes: sale.notes ? `From Sale #${saleNumber}. ${sale.notes}` : `From Sale #${saleNumber}`,
    saleId: saleId || null,
  };
}

// Helper function to sync invoice with all sales for a client (legacy aggregated invoice)
const syncInvoiceForClient = async (clientId) => {
  if (!clientId) return;

  // Get all sales for this client
  const allSales = await saleOps.findAll();
  const clientSales = allSales.filter((sale) => sale.clientId === clientId);

  // Get all invoices
  const allInvoices = await invoiceOps.findAll();
  const autoInvoice = allInvoices.find(
    (inv) => inv.clientId === clientId && inv.notes === "Auto-generated from sales"
  );

  if (clientSales.length === 0) {
    // If no sales, remove auto-generated invoice if it exists
    if (autoInvoice) {
      await invoiceOps.delete(autoInvoice.id);
    }
    return;
  }

  // Find the client to get client name
  const client = await clientOps.findById(clientId);
  if (!client) return;

  // Aggregate all sales into invoice items
  const itemMap = new Map();
  let totalSubtotal = 0;
  let totalTax = 0;
  let latestSaleDate = "";

  for (const sale of clientSales) {
    // Track the latest sale date
    if (!latestSaleDate || sale.date > latestSaleDate) {
      latestSaleDate = sale.date;
    }

    // Aggregate items from this sale
    for (const saleItem of sale.items || []) {
      const key = `${saleItem.inventoryItemId}-${saleItem.unitPrice}`;
      if (itemMap.has(key)) {
        const existingItem = itemMap.get(key);
        existingItem.quantity += saleItem.quantity;
        existingItem.total = existingItem.quantity * existingItem.unitPrice;
      } else {
        itemMap.set(key, {
          id: crypto.randomUUID(),
          name: saleItem.inventoryItemName,
          quantity: saleItem.quantity,
          unitPrice: saleItem.unitPrice,
          total: saleItem.quantity * saleItem.unitPrice,
        });
      }
    }

    // Aggregate tax (use the tax rate from the most recent sale)
    totalSubtotal += sale.subtotal || 0;
    totalTax += (sale.subtotal || 0) * ((sale.tax || 0) / 100);
  }

  const invoiceItems = Array.from(itemMap.values());
  const subtotal = invoiceItems.reduce((sum, item) => sum + item.total, 0);
  const taxRate = totalSubtotal > 0 ? (totalTax / totalSubtotal) * 100 : 0;
  const tax = (subtotal * taxRate) / 100;
  const total = subtotal + tax;

  // Generate month-based invoice number (e.g., "INV-2026-01" for January 2026)
  const saleDate = new Date(latestSaleDate);
  const year = saleDate.getFullYear();
  const month = String(saleDate.getMonth() + 1).padStart(2, "0");
  const monthBasedInvoiceNumber = `INV-${year}-${month}`;

  if (autoInvoice) {
    // Update existing auto-generated invoice
    await invoiceOps.update(autoInvoice.id, {
      invoiceNumber: monthBasedInvoiceNumber,
      date: latestSaleDate,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      items: invoiceItems,
      subtotal: subtotal,
      tax: tax,
      total: total,
    });
  } else {
    // Create new auto-generated invoice
    await invoiceOps.create({
      invoiceNumber: monthBasedInvoiceNumber,
      clientId: clientId,
      clientName: client.name,
      date: latestSaleDate,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      items: invoiceItems,
      subtotal: subtotal,
      tax: tax,
      total: total,
      status: "draft",
      notes: "Auto-generated from sales",
    });
  }
};

app.get("/api/sales", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }
    if (!currentUser?.teamId) {
      return res.status(403).json({ message: "You must belong to a team to access sales. No data is shared between users without a team." });
    }

    const sales = await saleOps.findAll(currentUser.teamId);
    res.json(sales);
  } catch (error) {
    console.error("Error fetching sales:", error);
    res.status(500).json({ message: "Error fetching sales" });
  }
});

app.get("/api/sales/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }
    if (!currentUser?.teamId) {
      return res.status(403).json({ message: "You must belong to a team to access this resource." });
    }
    const sale = await saleOps.findById(req.params.id);

    if (!sale || sale.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Sale not found" });
    }

    res.json(sale);
  } catch (error) {
    console.error("Error fetching sale:", error);
    res.status(500).json({ message: "Error fetching sale" });
  }
});

app.post("/api/sales", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }
    if (!currentUser?.teamId) {
      return res.status(403).json({ message: "You must belong to a team to create sales." });
    }
    const saleData = { ...req.body, teamId: currentUser.teamId };

    if (!Array.isArray(saleData.items) || saleData.items.length === 0) {
      return res.status(400).json({
        message: "Please add at least one item to the sale.",
      });
    }

    // Validate that all items have sufficient inventory
    for (const saleItem of saleData.items) {
      const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
      if (!inventoryItem) {
        return res.status(400).json({
          message: `Inventory item ${saleItem.inventoryItemName || saleItem.inventoryItemId} not found`,
        });
      }
      if (saleItem.quantity > inventoryItem.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${saleItem.quantity}`,
        });
      }
    }

    // Create the sale
    const newSale = await saleOps.create(saleData);

    // Update inventory quantities
    for (const saleItem of saleData.items || []) {
      const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
      if (inventoryItem) {
        await inventoryOps.update(saleItem.inventoryItemId, {
          quantity: inventoryItem.quantity - saleItem.quantity,
        });
      }
    }

    // Create one active (draft) invoice for this sale so it shows in Invoices immediately
    let newInvoice = null;
    const mergedSale = { ...saleData, ...newSale };
    const invoicePayload = buildInvoiceFromSale(mergedSale, newSale.id);
    const invoiceData = {
      teamId: currentUser.teamId,
      invoiceNumber: invoicePayload.invoiceNumber,
      clientId: invoicePayload.clientId,
      clientName: invoicePayload.clientName,
      date: invoicePayload.date,
      dueDate: invoicePayload.dueDate,
      items: invoicePayload.items,
      subtotal: invoicePayload.subtotal,
      tax: invoicePayload.tax,
      total: invoicePayload.total,
      status: invoicePayload.status,
      notes: invoicePayload.notes,
      saleId: invoicePayload.saleId,
    };
    try {
      newInvoice = await invoiceOps.create(invoiceData);
    } catch (invoiceError) {
      console.error("Error creating invoice from sale (sale was saved):", invoiceError.message || invoiceError);
      try {
        const { saleId: _s, ...dataWithoutSaleId } = invoiceData;
        newInvoice = await invoiceOps.create(dataWithoutSaleId);
      } catch (retryError) {
        console.error("Retry creating invoice without saleId failed:", retryError.message || retryError);
      }
    }

    res.status(201).json({ sale: newSale, invoice: newInvoice });
  } catch (error) {
    console.error("Error creating sale:", error);
    res.status(500).json({ message: "Error creating sale" });
  }
});

app.put("/api/sales/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }
    if (!currentUser?.teamId) {
      return res.status(403).json({ message: "You must belong to a team to access this resource." });
    }
    const oldSale = await saleOps.findById(req.params.id);

    if (!oldSale || oldSale.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Sale not found" });
    }

    const saleData = req.body;

    // If items are being updated, restore old quantities and validate new ones
    if (saleData.items && JSON.stringify(saleData.items) !== JSON.stringify(oldSale.items)) {
      // Restore old inventory quantities
      for (const oldItem of oldSale.items || []) {
        const inventoryItem = await inventoryOps.findById(oldItem.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(oldItem.inventoryItemId, {
            quantity: inventoryItem.quantity + oldItem.quantity,
          });
        }
      }

      // Validate new quantities
      for (const saleItem of saleData.items) {
        const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
        if (!inventoryItem) {
          // Restore old quantities
          for (const oldItem of oldSale.items || []) {
            const invItem = await inventoryOps.findById(oldItem.inventoryItemId);
            if (invItem) {
              await inventoryOps.update(oldItem.inventoryItemId, {
                quantity: invItem.quantity - oldItem.quantity,
              });
            }
          }
          return res.status(400).json({
            message: `Inventory item ${saleItem.inventoryItemName || saleItem.inventoryItemId} not found`,
          });
        }
        if (saleItem.quantity > inventoryItem.quantity) {
          // Restore old quantities
          for (const oldItem of oldSale.items || []) {
            const invItem = await inventoryOps.findById(oldItem.inventoryItemId);
            if (invItem) {
              await inventoryOps.update(oldItem.inventoryItemId, {
                quantity: invItem.quantity - oldItem.quantity,
              });
            }
          }
          return res.status(400).json({
            message: `Insufficient stock for ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${saleItem.quantity}`,
          });
        }
      }

      // Update inventory with new quantities
      for (const saleItem of saleData.items) {
        const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(saleItem.inventoryItemId, {
            quantity: inventoryItem.quantity - saleItem.quantity,
          });
        }
      }
    }

    const updatedSale = await saleOps.update(req.params.id, saleData);

    // Update the linked invoice for this sale (if saleId column exists and invoice exists)
    let linkedInvoice = null;
    try {
      linkedInvoice = await invoiceOps.findBySaleId(oldSale.id);
    } catch (findErr) {
      console.warn("Could not find linked invoice (saleId column may be missing):", findErr.message);
    }
    if (linkedInvoice) {
      try {
        const invoicePayload = buildInvoiceFromSale(updatedSale, oldSale.id);
        await invoiceOps.update(linkedInvoice.id, invoicePayload);
      } catch (updateErr) {
        console.warn("Could not update linked invoice:", updateErr.message);
      }
    }

    res.json(updatedSale);
  } catch (error) {
    console.error("Error updating sale:", error);
    res.status(500).json({ message: "Error updating sale" });
  }
});

app.delete("/api/sales/:id", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);

    if (!userHasPageAccess(currentUser, "sales")) {
      return res.status(403).json({ message: "You do not have access to Sales." });
    }
    if (!currentUser?.teamId) {
      return res.status(403).json({ message: "You must belong to a team to access this resource." });
    }
    const sale = await saleOps.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({ message: "Sale not found" });
    }
    if (sale.teamId != null && sale.teamId !== currentUser?.teamId) {
      return res.status(404).json({ message: "Sale not found" });
    }

    // Unlink any invoice that references this sale first (avoids FK / constraint issues)
    let linkedInvoice = null;
    try {
      linkedInvoice = await invoiceOps.findBySaleId(req.params.id);
    } catch (findErr) {
      console.warn("Could not find linked invoice (saleId column may be missing):", findErr.message);
    }
    if (linkedInvoice) {
      try {
        await invoiceOps.update(linkedInvoice.id, { saleId: null });
      } catch (unlinkErr) {
        console.warn("Could not unlink invoice from sale:", unlinkErr.message);
      }
    }

    // Restore inventory quantities (best-effort per item so one failure doesn't block delete)
    for (const saleItem of sale.items || []) {
      if (!saleItem?.inventoryItemId) continue;
      try {
        const inventoryItem = await inventoryOps.findById(saleItem.inventoryItemId);
        if (inventoryItem) {
          await inventoryOps.update(saleItem.inventoryItemId, {
            quantity: inventoryItem.quantity + (saleItem.quantity ?? 0),
          });
        }
      } catch (restoreErr) {
        console.warn("Could not restore inventory for item:", saleItem.inventoryItemId, restoreErr.message);
      }
    }

    await saleOps.delete(req.params.id);

    if (linkedInvoice) {
      try {
        await invoiceOps.delete(linkedInvoice.id);
      } catch (invoiceErr) {
        console.warn("Could not delete linked invoice:", invoiceErr.message);
      }
    }

    res.json({ message: "Sale deleted successfully" });
  } catch (error) {
    console.error("Error deleting sale:", error);
    const message = error?.message || error?.meta?.cause || "Error deleting sale";
    res.status(500).json({ message });
  }
});

// ==================== TEAM & INVITE ROUTES ====================

// Get team warehouse limit (no settings access required – used by Inventory page)
app.get("/api/team/limits", authenticateToken, async (req, res) => {
  try {
    const user = await userOps.findById(req.user.id);
    if (!user || !user.teamId) {
      return res.status(404).json({ message: "Team not found for user" });
    }
    const team = await teamOps.findById(user.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }
    const effectivePlan = getEffectivePlan(team);
    const planLimits = getPlanLimits(effectivePlan);
    res.json({
      effectiveMaxWarehouses: planLimits.maxWarehouses,
      effectivePlan,
    });
  } catch (error) {
    console.error("Error fetching team limits:", error);
    res.status(500).json({ message: "Error fetching team limits" });
  }
});

// Get current team name only (no settings access – used by header so name updates everywhere)
app.get("/api/team/name", authenticateToken, async (req, res) => {
  try {
    const user = await userOps.findById(req.user.id);
    if (!user || !user.teamId) {
      return res.status(404).json({ message: "Team not found for user" });
    }
    const team = await teamOps.findById(user.teamId);
    const name = team?.name?.trim() || `${user.name || user.email.split("@")[0]}'s Team`;
    res.json({ name });
  } catch (error) {
    console.error("Error fetching team name:", error);
    res.status(500).json({ message: "Error fetching team name" });
  }
});

// Get team details, members and invitations for the current user
app.get("/api/team", authenticateToken, async (req, res) => {
  try {
    const user = await userOps.findById(req.user.id);

    if (!user || !user.teamId) {
      return res.status(404).json({ message: "Team not found for user" });
    }

    if (!userHasPageAccess(user, "settings")) {
      return res.status(403).json({ message: "You do not have access to Settings." });
    }

    const team = await teamOps.findById(user.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const members = await userOps.findAllByTeam(user.teamId);
    const currentUserId = req.user.id;
    // Personal data (name, email) only for the current user; teammates get role/access only
    const membersFormatted = members.map((u) => {
      const base = {
        id: u.id,
        teamRole: u.teamRole || (u.id === team.ownerId ? "owner" : "member"),
        maxInventoryItems: u.maxInventoryItems ?? null,
        allowedPages: u.allowedPages ?? null,
        allowedWarehouseIds: u.allowedWarehouseIds ?? null,
      };
      if (u.id === currentUserId) {
        return { ...base, email: u.email, name: u.name };
      }
      return { ...base, isTeammate: true };
    });

    const invitations = await invitationOps.findAllByTeam(user.teamId);
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
      allowedWarehouseIds: inv.allowedWarehouseIds ?? null,
    }));

    // Count warehouses for basic plan/usage info
    const warehouseCount = await warehouseOps.countByTeam(team.id);
    
    // Get trial status
    const trialStatus = getTrialStatus(team);
    const effectivePlan = getEffectivePlan(team);
    const planLimits = getPlanLimits(effectivePlan);
    const effectiveMaxWarehouses = planLimits.maxWarehouses;

    // Parse invoice style JSON for frontend
    let invoiceStyle = null;
    if (team.invoiceStyle) {
      try {
        invoiceStyle = typeof team.invoiceStyle === "string" ? JSON.parse(team.invoiceStyle) : team.invoiceStyle;
      } catch (_) {}
    }
    res.json({
      team: {
        id: team.id,
        name: team.name,
        ownerId: team.ownerId,
        plan: team.plan || "free",
        effectivePlan, // The actual plan considering trial status
        maxWarehouses: team.maxWarehouses,
        effectiveMaxWarehouses, // Limit for current plan/trial (Pro trial = 10, Starter trial = 3, etc.)
        warehouseCount,
        billingInterval: team.billingInterval || null, // "month" | "year" from Stripe
        // Trial information
        isOnTrial: team.isOnTrial || false,
        trialEndsAt: team.trialEndsAt,
        trialStatus,
        // Billing: true if team has Stripe customer (can open portal to manage subscription)
        billingPortalAvailable: Boolean(team.stripeCustomerId),
        // Invoice email branding
        invoiceLogoUrl: team.invoiceLogoUrl ?? null,
        invoiceStyle,
      },
      members: membersFormatted,
      invitations: invitationsFormatted,
    });
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({ message: "Error fetching team information" });
  }
});

// Update team (name and/or invoice style; owner only)
app.patch("/api/team", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can update team settings" });
    }
    const team = await teamOps.findById(currentUser.teamId);
    const updates = {};
    if (typeof req.body.name === "string" && req.body.name.trim()) {
      updates.name = req.body.name.trim();
    }
    if (req.body.invoiceLogoUrl !== undefined) {
      updates.invoiceLogoUrl =
        req.body.invoiceLogoUrl == null || req.body.invoiceLogoUrl === ""
          ? null
          : String(req.body.invoiceLogoUrl).trim() || null;
    }
    if (req.body.invoiceStyle !== undefined) {
      updates.invoiceStyle =
        req.body.invoiceStyle == null
          ? null
          : typeof req.body.invoiceStyle === "string"
            ? req.body.invoiceStyle
            : JSON.stringify(req.body.invoiceStyle);
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid updates provided" });
    }
    await teamOps.update(currentUser.teamId, updates);
    const updated = await teamOps.findById(currentUser.teamId);
    let invoiceStyle = null;
    if (updated.invoiceStyle) {
      try {
        invoiceStyle = typeof updated.invoiceStyle === "string" ? JSON.parse(updated.invoiceStyle) : updated.invoiceStyle;
      } catch (_) {}
    }
    res.json({
      team: {
        id: updated.id,
        name: updated.name,
        invoiceLogoUrl: updated.invoiceLogoUrl ?? null,
        invoiceStyle,
      },
    });
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).json({ message: "Error updating team" });
  }
});

// Create an invitation for the current user's team
app.post("/api/team/invitations", authenticateToken, async (req, res) => {
  try {
    const {
      email,
      teamRole = "member",
      maxInventoryItems = null,
      allowedPages = null,
      allowedWarehouseIds = null,
    } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const currentUser = await userOps.findById(req.user.id);

    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }

    if (!userHasPageAccess(currentUser, "settings")) {
      return res.status(403).json({ message: "You do not have access to Settings." });
    }

    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can invite new members" });
    }

    const team = await teamOps.findById(currentUser.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const normalisedAllowedPages =
      Array.isArray(allowedPages) && allowedPages.length > 0 ? allowedPages : null;
    const normalisedAllowedWarehouseIds =
      Array.isArray(allowedWarehouseIds) && allowedWarehouseIds.length > 0
        ? allowedWarehouseIds
        : null;

    const invitation = await invitationOps.create({
      teamId: currentUser.teamId,
      email,
      teamRole,
      maxInventoryItems: typeof maxInventoryItems === "number" ? maxInventoryItems : null,
      allowedPages: normalisedAllowedPages,
      allowedWarehouseIds: normalisedAllowedWarehouseIds,
      status: "pending",
      token: crypto.randomUUID(),
      expiresAt,
      invitedByUserId: currentUser.id,
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
      allowedWarehouseIds: invitation.allowedWarehouseIds,
    });
  } catch (error) {
    console.error("Error creating invitation:", error);
    res.status(500).json({ message: "Error creating invitation" });
  }
});

// Accept an invitation using its token – the currently authenticated user is added to the team
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

    const user = await userOps.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Associate user with the team and apply limits/role/access from invitation
    const updatedUser = await userOps.update(user.id, {
      teamId: invitation.teamId,
      teamRole: invitation.teamRole || "member",
      maxInventoryItems:
        typeof invitation.maxInventoryItems === "number"
          ? invitation.maxInventoryItems
          : user.maxInventoryItems ?? null,
      allowedPages:
        Array.isArray(invitation.allowedPages) && invitation.allowedPages.length > 0
          ? invitation.allowedPages
          : user.allowedPages ?? null,
      allowedWarehouseIds:
        Array.isArray(invitation.allowedWarehouseIds) &&
        invitation.allowedWarehouseIds.length > 0
          ? invitation.allowedWarehouseIds
          : user.allowedWarehouseIds ?? null,
    });

    await invitationOps.update(invitation.id, {
      status: "accepted",
      acceptedAt: now,
      acceptedByUserId: user.id,
    });

    res.json({
      message: "Invitation accepted successfully",
      teamId: updatedUser.teamId,
      teamRole: updatedUser.teamRole,
      maxInventoryItems: updatedUser.maxInventoryItems,
      allowedPages: updatedUser.allowedPages ?? null,
      allowedWarehouseIds: updatedUser.allowedWarehouseIds ?? null,
    });
  } catch (error) {
    console.error("Error accepting invitation:", error);
    res.status(500).json({ message: "Error accepting invitation" });
  }
});

// Update a team member's role and access (owner only; cannot edit self if owner)
app.patch("/api/team/members/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
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
    const targetUser = await userOps.findById(targetUserId);
    if (!targetUser || targetUser.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Member not found in your team" });
    }
    const { teamRole, maxInventoryItems, allowedPages, allowedWarehouseIds } = req.body || {};
    const updates = {};
    if (teamRole === "member" || teamRole === "viewer") updates.teamRole = teamRole;
    if (typeof maxInventoryItems === "number" || maxInventoryItems === null) updates.maxInventoryItems = maxInventoryItems;
    if (Array.isArray(allowedPages)) updates.allowedPages = allowedPages;
    if (Array.isArray(allowedWarehouseIds)) updates.allowedWarehouseIds = allowedWarehouseIds;
    await userOps.update(targetUserId, updates);
    const updated = await userOps.findById(targetUserId);
    res.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      teamRole: updated.teamRole,
      maxInventoryItems: updated.maxInventoryItems ?? null,
      allowedPages: updated.allowedPages ?? null,
      allowedWarehouseIds: updated.allowedWarehouseIds ?? null,
    });
  } catch (error) {
    console.error("Error updating member:", error);
    res.status(500).json({ message: "Error updating member" });
  }
});

// Remove a member from the team (owner only; cannot remove self)
app.delete("/api/team/members/:userId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
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
    const targetUser = await userOps.findById(targetUserId);
    if (!targetUser || targetUser.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Member not found in your team" });
    }
    await userOps.update(targetUserId, { teamId: null, teamRole: null, maxInventoryItems: null, allowedPages: null, allowedWarehouseIds: null });
    res.json({ message: "Member removed from team" });
  } catch (error) {
    console.error("Error removing member:", error);
    res.status(500).json({ message: "Error removing member" });
  }
});

// Update a pending invitation (owner only)
app.patch("/api/team/invitations/:invitationId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can edit invitations" });
    }
    const invitationId = req.params.invitationId;
    const invitation = await invitationOps.findById(invitationId);
    if (!invitation || invitation.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    if (invitation.status !== "pending") {
      return res.status(400).json({ message: "Only pending invitations can be edited" });
    }
    const { teamRole, maxInventoryItems, allowedPages, allowedWarehouseIds } = req.body || {};
    const updates = {};
    if (teamRole === "member" || teamRole === "viewer") updates.teamRole = teamRole;
    if (typeof maxInventoryItems === "number" || maxInventoryItems === null) updates.maxInventoryItems = maxInventoryItems;
    if (Array.isArray(allowedPages)) updates.allowedPages = allowedPages;
    if (Array.isArray(allowedWarehouseIds)) updates.allowedWarehouseIds = allowedWarehouseIds;
    await invitationOps.update(invitationId, updates);
    const updated = await invitationOps.findById(invitationId);
    res.json({
      id: updated.id,
      email: updated.email,
      teamRole: updated.teamRole,
      maxInventoryItems: updated.maxInventoryItems ?? null,
      status: updated.status,
      token: updated.token,
      createdAt: updated.createdAt,
      expiresAt: updated.expiresAt,
      allowedPages: updated.allowedPages ?? null,
      allowedWarehouseIds: updated.allowedWarehouseIds ?? null,
    });
  } catch (error) {
    console.error("Error updating invitation:", error);
    res.status(500).json({ message: "Error updating invitation" });
  }
});

// Revoke (delete) a pending invitation (owner only)
app.delete("/api/team/invitations/:invitationId", authenticateToken, async (req, res) => {
  try {
    const currentUser = await userOps.findById(req.user.id);
    if (!currentUser || !currentUser.teamId) {
      return res.status(400).json({ message: "You are not associated with a team" });
    }
    if (currentUser.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can revoke invitations" });
    }
    const invitationId = req.params.invitationId;
    const invitation = await invitationOps.findById(invitationId);
    if (!invitation || invitation.teamId !== currentUser.teamId) {
      return res.status(404).json({ message: "Invitation not found" });
    }
    await invitationOps.delete(invitationId);
    res.json({ message: "Invitation revoked" });
  } catch (error) {
    console.error("Error revoking invitation:", error);
    res.status(500).json({ message: "Error revoking invitation" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

// CORS debug: call this from the same origin as your app to see what origin the server received.
// Add that exact value to CORS_ORIGIN on Railway if it's missing.
app.get("/api/cors-check", (req, res) => {
  res.json({
    origin: req.headers.origin || "(no Origin header)",
    note: "Add this exact origin to Railway CORS_ORIGIN if signup fails with 'Load failed'.",
  });
});

// ==================== TRIAL MANAGEMENT ====================

// Background job to downgrade expired trials
// Runs every hour
const TRIAL_CHECK_INTERVAL = 60 * 60 * 1000; // 1 hour

async function checkAndDowngradeTrials() {
  try {
    console.log('[TRIAL] Checking for expired trials...');
    const downgraded = await downgradeExpiredTrials();
    if (downgraded > 0) {
      console.log(`[TRIAL] Successfully downgraded ${downgraded} expired trial(s)`);
    }
  } catch (error) {
    console.error('[TRIAL] Error checking expired trials:', error);
  }
}

// Run trial check on startup
checkAndDowngradeTrials();

// Schedule recurring checks
setInterval(checkAndDowngradeTrials, TRIAL_CHECK_INTERVAL);
console.log(`[TRIAL] Scheduled trial checks every ${TRIAL_CHECK_INTERVAL / 1000 / 60} minutes`);

// Manual endpoint to start a Pro or Starter trial (in-app trial; for auto-charge at trial end use Stripe Checkout with trial)
app.post("/api/team/start-trial", authenticateToken, async (req, res) => {
  try {
    const user = await userOps.findById(req.user.id);
    if (!user || !user.teamId) {
      return res.status(404).json({ message: "Team not found for user" });
    }

    if (user.teamRole !== "owner") {
      return res.status(403).json({ message: "Only team owners can start trials" });
    }

    const team = await teamOps.findById(user.teamId);
    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    if (team.isOnTrial) {
      return res.status(400).json({ message: "Team is already on a trial" });
    }

    if (team.plan !== "free") {
      return res.status(400).json({ message: "Trials are only available for free plan teams" });
    }

    const plan = req.body?.plan === "starter" ? "starter" : "pro";
    const updatedTeam = plan === "starter"
      ? await startStarterTrial(team.id)
      : await startProTrial(team.id);
    const trialStatus = getTrialStatus(updatedTeam);

    res.json({
      message: `14-day ${plan === "starter" ? "Starter" : "Pro"} trial started successfully!`,
      trial: trialStatus,
      team: {
        plan: updatedTeam.plan,
        effectivePlan: getEffectivePlan(updatedTeam),
        maxWarehouses: updatedTeam.maxWarehouses,
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
  console.log(`\nDemo credentials:`);
  console.log(`  Email: demo@example.com`);
  console.log(`  Password: demo123`);
  console.log(`\n(Or use any email/password for demo)`);
});
