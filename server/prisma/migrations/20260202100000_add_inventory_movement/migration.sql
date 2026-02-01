-- CreateTable: inventory movement log for ins/outs reports
CREATE TABLE IF NOT EXISTS "InventoryMovement" (
  "id" TEXT NOT NULL,
  "teamId" TEXT,
  "inventoryItemId" TEXT NOT NULL,
  "quantityDelta" DOUBLE PRECISION NOT NULL,
  "movementType" TEXT NOT NULL,
  "referenceType" TEXT,
  "referenceId" TEXT,
  "referenceLabel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InventoryMovement_teamId_idx" ON "InventoryMovement"("teamId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_inventoryItemId_idx" ON "InventoryMovement"("inventoryItemId");
CREATE INDEX IF NOT EXISTS "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");
