/**
 * Must run before any app/db import. Forces test DB and disables live Stripe/Admin by default.
 */
process.env.NODE_ENV = "test";
process.env.APP_ENV = "local";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-harness";
process.env.SUPER_ADMIN_EMAILS = process.env.SUPER_ADMIN_EMAILS || "";
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "test-admin-session";

const DEFAULT_TEST_URL =
  "postgresql://stockstay:stockstay@localhost:5433/stockstay_test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || DEFAULT_TEST_URL;

// Ensure Stripe stays unconfigured unless a test explicitly sets keys
if (!process.env.FORCE_STRIPE_IN_TESTS) {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
}
