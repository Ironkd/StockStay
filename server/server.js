import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pathToFileURL } from "url";
import "dotenv/config";
import { prisma } from "./db.js";
import { generateDraftInvoicesForAllTeams } from "./clientBilling.js";
import { createCatalogueAuth } from "./middleware/catalogueAuth.js";
import { createRequireWriteAccess } from "./middleware/requireWriteAccess.js";
import {
  createAuthenticateToken,
  ensureMembershipContext,
  loadCurrentUser,
  buildAuthUserPayload,
  userHasPageAccess,
} from "./middleware/authHelpers.js";
import { sendSupportEmail } from "./email.js";
import { getAllPlans, downgradeExpiredTrials } from "./trialManager.js";
import { handleWebhook } from "./billing.js";
import { registerAllRoutes } from "./routes/register.js";

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
const DEFAULT_JWT_SECRET = "your-secret-key-change-in-production";
// Mis-set APP_ENV=local on a production Node process must not silently use the hardcoded default.
if (isProduction && (!process.env.JWT_SECRET || JWT_SECRET === DEFAULT_JWT_SECRET)) {
  console.error(
    "FATAL: JWT_SECRET must be set to a non-default value when NODE_ENV=production."
  );
  process.exit(1);
}

// CORS: single origin or comma-separated list (e.g. https://stockstay.com,https://stockstay.ca)
// Capacitor mobile apps use capacitor://localhost (iOS) and http://localhost (Android) – allow when CORS is configured
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const corsOriginsRaw = CORS_ORIGIN
  ? CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)
  : [];
if (requiresJwtSecret && corsOriginsRaw.length === 0) {
  console.error(
    `FATAL: CORS_ORIGIN must be set when APP_ENV=${appEnv}. Use a comma-separated allow-list of frontend origins.`
  );
  process.exit(1);
}
const capacitorOrigins = ["capacitor://localhost", "http://localhost", "https://localhost"];
const corsOrigins =
  corsOriginsRaw.length > 0 ? [...new Set([...corsOriginsRaw, ...capacitorOrigins])] : [];

// Handle OPTIONS first (before any other middleware) so preflight never gets 502
app.options(/.*/, (req, res) => {
  const origin = req.headers.origin;
  // Fail closed: never reflect an origin when the allow-list is empty.
  const allowed = corsOrigins.length > 0 && origin && corsOrigins.includes(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.status(allowed ? 204 : 403).end();
});

// Root path – respond first so "Cannot GET /" never appears
app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", service: "StockStay API", docs: "/api/health", appEnv });
});

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: "ok",
      service: "StockStay API",
      appEnv,
      database: "up",
      time: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({
      status: "degraded",
      service: "StockStay API",
      appEnv,
      database: "down",
      time: new Date().toISOString(),
    });
  }
});

// Security: secure headers
app.use(
  helmet({
    // Allow browser clients on another origin (Vite) to read API responses when CORS allows them
    crossOriginResourcePolicy: { policy: "cross-origin" },
    // AdminJS serves an SPA with inline assets; keep other Helmet protections
    contentSecurityPolicy: false,
  })
);

// Middleware – restrict origin when configured; fail closed (deny all) when empty
app.use(
  cors(
    corsOrigins.length > 0
      ? { origin: corsOrigins, credentials: true }
      : { origin: false }
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
      res.status(400).send("Webhook verification failed");
    }
  }
);

app.use(express.json());

/** Public plan config for marketing + UI (BR-17 / NFR-15). Loaded at boot from plan-limits.json. */
app.get("/api/plans", (_req, res) => {
  res.json(getAllPlans());
});

/** Public contact / in-app feedback (NFR-20). */
const contactRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many messages. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
});

app.post("/api/contact", contactRateLimiter, async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!email || !message) {
      return res.status(400).json({ message: "Email and message are required." });
    }
    const ok = await sendSupportEmail(email, name || "Someone", message);
    if (!ok) {
      return res.status(503).json({ message: "Unable to send message right now. Please try again later." });
    }
    res.json({ message: "Message sent." });
  } catch (error) {
    console.error("Error sending contact message:", error);
    res.status(500).json({ message: "Failed to send message." });
  }
});

const authenticateToken = createAuthenticateToken(JWT_SECRET);

const {
  requireCatalogueRead,
  requireCatalogueWrite,
  requireInventoryRead,
  requireInventoryWrite,
} = createCatalogueAuth({ loadCurrentUser, userHasPageAccess });

const requireWriteAccess = createRequireWriteAccess({ loadCurrentUser });

registerAllRoutes(app, {
  authenticateToken,
  JWT_SECRET,
  ensureMembershipContext,
  loadCurrentUser,
  buildAuthUserPayload,
  userHasPageAccess,
  requireCatalogueRead,
  requireCatalogueWrite,
  requireInventoryRead,
  requireInventoryWrite,
  requireWriteAccess,
});

// JSON 404 for unmatched API routes (after all route registration)
app.use("/api", (_req, res) => {
  res.status(404).json({ message: "Not found" });
});

// Global JSON error handler — middleware that calls next(err) must not fall through to HTML
app.use((err, _req, res, _next) => {
  console.error("[API]", err?.stack || err?.message || err);
  const status = Number(err?.status || err?.statusCode) || 500;
  res.status(status).json({
    message: status >= 500 ? "Internal server error" : err?.message || "Request failed",
  });
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

if (process.env.NODE_ENV !== "test") {
  checkAndDowngradeTrials();
  setInterval(checkAndDowngradeTrials, TRIAL_CHECK_INTERVAL);
  console.log(`[TRIAL] Scheduled trial checks every ${TRIAL_CHECK_INTERVAL / 1000 / 60} minutes`);
}

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
if (process.env.NODE_ENV !== "test") {
  setTimeout(runScheduledClientBilling, 60 * 1000);
  setInterval(runScheduledClientBilling, BILLING_CHECK_INTERVAL);
  console.log(`[BILLING] Scheduled draft generation every ${BILLING_CHECK_INTERVAL / 1000 / 60 / 60} hours`);
}

let adminMountPromise = null;

/** Mount AdminJS once (used by boot and by tests). Lazy-imports so API tests skip the AdminJS graph. */
export async function ensureAdminMounted() {
  if (!adminMountPromise) {
    adminMountPromise = (async () => {
      try {
        const { mountAdmin } = await import("./admin.js");
        await mountAdmin(app);
      } catch (err) {
        console.error("[admin] Failed to mount AdminJS:", err?.message || err);
        if (err?.stack) console.error(err.stack);
        // In deployed envs, fail boot so silent AdminJS breakage cannot recur.
        // Tests keep a 503 stub so API suites stay independent of AdminJS peers.
        if (process.env.NODE_ENV !== "test" && requiresJwtSecret) {
          throw err;
        }
        app.use("/admin", (_req, res) => {
          res.status(503).json({ message: "Platform admin unavailable." });
        });
      }
    })();
  }
  await adminMountPromise;
  return app;
}

// Start server after mounting AdminJS (bind to 0.0.0.0 so Railway can reach the process)
export async function startServer() {
  await ensureAdminMounted();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📝 API available at http://localhost:${PORT}/api`);
    console.log(`🛠  AdminJS at http://localhost:${PORT}/admin`);
    console.log(`🌍 APP_ENV=${appEnv}`);
  });
}

export { app, JWT_SECRET };

// Only listen when this file is the process entrypoint (not when imported by tests)
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer();
}
