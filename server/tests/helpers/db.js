import { prisma } from "../../db.js";

/** Tables truncated between tests. UnitOfMeasure seed rows are preserved. */
const TRUNCATE_SQL = `
TRUNCATE TABLE
  "InvoiceLine",
  "Invoice",
  "ReplenishmentLine",
  "Replenishment",
  "StockTransaction",
  "StockOnHand",
  "LocationSupplyThreshold",
  "Sku",
  "SupplyItem",
  "StockLocationProperty",
  "StockLocation",
  "Property",
  "Client",
  "Invitation",
  "PasswordResetToken",
  "UserMembership",
  "Team",
  "Organization",
  "User"
CASCADE
`;

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(TRUNCATE_SQL);
  // Drop AdminJS sessions if the table exists
  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'adminjs_session') THEN
        TRUNCATE TABLE adminjs_session;
      END IF;
    END $$;
  `);
}

export { prisma };
