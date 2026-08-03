/**
 * Platform Super Admin via AdminJS (Appendix A #11).
 * Gated by SUPER_ADMIN_EMAILS; full Prisma schema CRUD.
 */

import AdminJS from "adminjs";
import AdminJSExpress from "@adminjs/express";
import { Database, Resource, getModelByName } from "@adminjs/prisma";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { prisma, userOps } from "./db.js";

AdminJS.registerAdapter({ Database, Resource });

const MODEL_NAMES = [
  "User",
  "Organization",
  "Team",
  "UserMembership",
  "Invitation",
  "Property",
  "Client",
  "Invoice",
  "InvoiceLine",
  "StockLocation",
  "StockLocationProperty",
  "UnitOfMeasure",
  "SupplyItem",
  "Sku",
  "StockOnHand",
  "LocationSupplyThreshold",
  "StockTransaction",
  "Replenishment",
  "ReplenishmentLine",
  "PasswordResetToken",
];

export function getSuperAdminEmails() {
  const raw = process.env.SUPER_ADMIN_EMAILS || "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

function resourceOptions(name) {
  if (name === "User") {
    return {
      properties: {
        password: {
          isVisible: { list: false, filter: false, show: false, edit: false },
        },
      },
    };
  }
  return {};
}

/**
 * @param {import('express').Express} app
 * @returns {Promise<{ enabled: boolean, rootPath: string }>}
 */
export async function mountAdmin(app) {
  const allowlist = getSuperAdminEmails();
  const rootPath = "/admin";

  if (allowlist.size === 0) {
    console.warn(
      "[admin] SUPER_ADMIN_EMAILS is empty — AdminJS disabled (GET /admin → 404)"
    );
    app.use(rootPath, (_req, res) => {
      res.status(404).json({
        message: "Platform admin is disabled. Set SUPER_ADMIN_EMAILS to enable.",
      });
    });
    return { enabled: false, rootPath };
  }

  const resources = MODEL_NAMES.map((name) => ({
    resource: { model: getModelByName(name), client: prisma },
    options: resourceOptions(name),
  }));

  const admin = new AdminJS({
    rootPath,
    resources,
    branding: {
      companyName: "Stock Stay Admin",
      withMadeWithLove: false,
    },
  });

  const appEnv = process.env.APP_ENV || "local";
  const isLocal = appEnv === "local";
  const sessionSecret =
    process.env.ADMIN_SESSION_SECRET ||
    process.env.JWT_SECRET ||
    (isLocal ? "local-admin-dev-secret-change-me" : "");

  if (!sessionSecret) {
    console.warn(
      "[admin] ADMIN_SESSION_SECRET (or JWT_SECRET) missing — AdminJS disabled"
    );
    app.use(rootPath, (_req, res) => {
      res.status(404).json({ message: "Platform admin misconfigured." });
    });
    return { enabled: false, rootPath };
  }

  const sessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000,
      secure: !isLocal,
      sameSite: isLocal ? "lax" : "none",
    },
  };

  if (!isLocal && process.env.DATABASE_URL) {
    const PgStore = ConnectPgSimple(session);
    sessionOptions.store = new PgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      tableName: "adminjs_session",
    });
  }

  const router = AdminJSExpress.buildAuthenticatedRouter(
    admin,
    {
      authenticate: async (email, password) => {
        if (!email || !password) return null;
        const normalized = String(email).trim().toLowerCase();
        if (!allowlist.has(normalized)) return null;
        const user = await userOps.findByEmail(normalized);
        if (!user?.password) return null;
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;
        return {
          email: user.email,
          id: user.id,
          title: user.name || user.email,
        };
      },
      cookieName: "stockstay.admin",
      cookiePassword: sessionSecret,
    },
    null,
    sessionOptions
  );

  app.use(admin.options.rootPath, router);
  console.log(
    `[admin] AdminJS mounted at ${rootPath} (${allowlist.size} allowlisted email(s))`
  );
  return { enabled: true, rootPath };
}
