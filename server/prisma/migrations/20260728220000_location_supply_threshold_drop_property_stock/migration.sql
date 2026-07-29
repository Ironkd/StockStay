-- CreateTable
CREATE TABLE "LocationSupplyThreshold" (
    "id" TEXT NOT NULL,
    "stockLocationId" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "reorderPoint" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reorderQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationSupplyThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LocationSupplyThreshold_stockLocationId_idx" ON "LocationSupplyThreshold"("stockLocationId");

-- CreateIndex
CREATE INDEX "LocationSupplyThreshold_supplyItemId_idx" ON "LocationSupplyThreshold"("supplyItemId");

-- CreateIndex
CREATE UNIQUE INDEX "LocationSupplyThreshold_stockLocationId_supplyItemId_key" ON "LocationSupplyThreshold"("stockLocationId", "supplyItemId");

-- AddForeignKey
ALTER TABLE "LocationSupplyThreshold" ADD CONSTRAINT "LocationSupplyThreshold_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSupplyThreshold" ADD CONSTRAINT "LocationSupplyThreshold_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropTable
DROP TABLE "PropertyStock";
