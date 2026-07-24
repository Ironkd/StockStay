-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('weekly', 'biweekly', 'monthly_eom');

-- CreateEnum
CREATE TYPE "ReplenishmentDirection" AS ENUM ('replenish', 'return');

-- CreateEnum
CREATE TYPE "ReplenishmentStatus" AS ENUM ('completed');

-- AlterTable Client
ALTER TABLE "Client" ADD COLUMN "defaultMarkupPercentage" DECIMAL(9,4) NOT NULL DEFAULT 0;
ALTER TABLE "Client" ADD COLUMN "billingFrequency" "BillingFrequency" NOT NULL DEFAULT 'monthly_eom';

-- AlterTable Property
ALTER TABLE "Property" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Property" ADD COLUMN "markupPercentage" DECIMAL(9,4);

-- CreateTable
CREATE TABLE "Replenishment" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "stockLocationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "direction" "ReplenishmentDirection" NOT NULL,
    "status" "ReplenishmentStatus" NOT NULL DEFAULT 'completed',
    "performedByUserId" TEXT,
    "transferGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Replenishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplenishmentLine" (
    "id" TEXT NOT NULL,
    "replenishmentId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "baseQtyDeployed" DECIMAL(18,6) NOT NULL,
    "packQtyConsumed" DECIMAL(18,6) NOT NULL,
    "unitRate" DECIMAL(18,6) NOT NULL,
    "markupPercentage" DECIMAL(9,4) NOT NULL,
    "billBackAmount" DECIMAL(18,4) NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "invoiced" BOOLEAN NOT NULL DEFAULT false,
    "reversesLineId" TEXT,
    "stockPostingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReplenishmentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Property_clientId_idx" ON "Property"("clientId");

-- CreateIndex
CREATE INDEX "Replenishment_teamId_createdAt_idx" ON "Replenishment"("teamId", "createdAt");

-- CreateIndex
CREATE INDEX "Replenishment_propertyId_idx" ON "Replenishment"("propertyId");

-- CreateIndex
CREATE INDEX "Replenishment_stockLocationId_idx" ON "Replenishment"("stockLocationId");

-- CreateIndex
CREATE INDEX "Replenishment_transferGroupId_idx" ON "Replenishment"("transferGroupId");

-- CreateIndex
CREATE INDEX "ReplenishmentLine_replenishmentId_idx" ON "ReplenishmentLine"("replenishmentId");

-- CreateIndex
CREATE INDEX "ReplenishmentLine_skuId_idx" ON "ReplenishmentLine"("skuId");

-- CreateIndex
CREATE INDEX "ReplenishmentLine_supplyItemId_idx" ON "ReplenishmentLine"("supplyItemId");

-- CreateIndex
CREATE INDEX "ReplenishmentLine_invoiced_idx" ON "ReplenishmentLine"("invoiced");

-- CreateIndex
CREATE INDEX "ReplenishmentLine_reversesLineId_idx" ON "ReplenishmentLine"("reversesLineId");

-- CreateIndex
CREATE INDEX "ReplenishmentLine_stockPostingId_idx" ON "ReplenishmentLine"("stockPostingId");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replenishment" ADD CONSTRAINT "Replenishment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replenishment" ADD CONSTRAINT "Replenishment_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Replenishment" ADD CONSTRAINT "Replenishment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplenishmentLine" ADD CONSTRAINT "ReplenishmentLine_replenishmentId_fkey" FOREIGN KEY ("replenishmentId") REFERENCES "Replenishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplenishmentLine" ADD CONSTRAINT "ReplenishmentLine_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplenishmentLine" ADD CONSTRAINT "ReplenishmentLine_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplenishmentLine" ADD CONSTRAINT "ReplenishmentLine_reversesLineId_fkey" FOREIGN KEY ("reversesLineId") REFERENCES "ReplenishmentLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
