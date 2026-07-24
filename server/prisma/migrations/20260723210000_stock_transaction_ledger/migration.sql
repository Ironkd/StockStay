-- CreateEnum
CREATE TYPE "StockEntityType" AS ENUM ('stock_on_hand', 'property_stock');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('receipt', 'adjustment', 'replenishment_out', 'replenishment_in', 'invoice');

-- CreateTable
CREATE TABLE "PropertyStock" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reorderQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockTransaction" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "entityType" "StockEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "quantityDelta" DECIMAL(18,6) NOT NULL,
    "transactionType" "StockTransactionType" NOT NULL,
    "postingId" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyStock_teamId_idx" ON "PropertyStock"("teamId");

-- CreateIndex
CREATE INDEX "PropertyStock_propertyId_idx" ON "PropertyStock"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyStock_supplyItemId_idx" ON "PropertyStock"("supplyItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyStock_propertyId_supplyItemId_key" ON "PropertyStock"("propertyId", "supplyItemId");

-- CreateIndex
CREATE INDEX "StockTransaction_teamId_createdAt_idx" ON "StockTransaction"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "StockTransaction_entityType_entityId_idx" ON "StockTransaction"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "StockTransaction_postingId_idx" ON "StockTransaction"("postingId");

-- CreateIndex
CREATE INDEX "StockTransaction_referenceType_referenceId_idx" ON "StockTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "StockTransaction_createdByUserId_idx" ON "StockTransaction"("createdByUserId");

-- AddForeignKey
ALTER TABLE "PropertyStock" ADD CONSTRAINT "PropertyStock_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyStock" ADD CONSTRAINT "PropertyStock_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyStock" ADD CONSTRAINT "PropertyStock_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockTransaction" ADD CONSTRAINT "StockTransaction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
