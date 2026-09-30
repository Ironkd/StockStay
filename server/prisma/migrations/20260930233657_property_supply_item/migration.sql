-- CreateTable
CREATE TABLE "PropertySupplyItem" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "parQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertySupplyItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertySupplyItem_propertyId_idx" ON "PropertySupplyItem"("propertyId");

-- CreateIndex
CREATE INDEX "PropertySupplyItem_supplyItemId_idx" ON "PropertySupplyItem"("supplyItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PropertySupplyItem_propertyId_supplyItemId_key" ON "PropertySupplyItem"("propertyId", "supplyItemId");

-- CreateIndex
CREATE INDEX "StockOnHand_skuId_idx" ON "StockOnHand"("skuId");

-- AddForeignKey
ALTER TABLE "PropertySupplyItem" ADD CONSTRAINT "PropertySupplyItem_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertySupplyItem" ADD CONSTRAINT "PropertySupplyItem_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
