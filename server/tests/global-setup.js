import pg from "pg";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(__dirname, "..");

const DEFAULT_TEST_URL =
  "postgresql://stockstay:stockstay@localhost:5433/stockstay_test";
const ADMIN_URL = "postgresql://stockstay:stockstay@localhost:5433/postgres";

export default async function globalSetup() {
  const testUrl = process.env.TEST_DATABASE_URL || DEFAULT_TEST_URL;
  process.env.DATABASE_URL = testUrl;
  process.env.NODE_ENV = "test";
  process.env.APP_ENV = "local";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-harness";

  const admin = new pg.Client({ connectionString: ADMIN_URL });
  try {
    await admin.connect();
    const exists = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      ["stockstay_test"]
    );
    if (exists.rowCount === 0) {
      await admin.query("CREATE DATABASE stockstay_test");
      console.log("[test globalSetup] Created database stockstay_test");
    }
  } catch (err) {
    console.error(
      "[test globalSetup] Cannot reach Postgres. Start Docker: docker compose up -d\n",
      err.message
    );
    throw err;
  } finally {
    await admin.end().catch(() => {});
  }

  execSync("npx prisma migrate deploy", {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: "inherit",
  });

  return async () => {};
}
