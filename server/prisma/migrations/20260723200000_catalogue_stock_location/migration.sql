-- CreateEnum
CREATE TYPE "UnitDimension" AS ENUM ('count', 'volume', 'mass', 'length', 'other');

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" "UnitDimension" NOT NULL DEFAULT 'count',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocationProperty" (
    "id" TEXT NOT NULL,
    "stockLocationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLocationProperty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyItem" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "baseUnitId" TEXT NOT NULL,
    "defaultReorderPoint" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "defaultReorderQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplyItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "supplyItemId" TEXT NOT NULL,
    "stockLocationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supplier" TEXT,
    "packSize" DECIMAL(18,6) NOT NULL,
    "purchasePrice" DECIMAL(18,4) NOT NULL,
    "unitRate" DECIMAL(18,6) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockOnHand" (
    "id" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockOnHand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_code_key" ON "UnitOfMeasure"("code");

-- CreateIndex
CREATE INDEX "StockLocation_teamId_idx" ON "StockLocation"("teamId");

-- CreateIndex
CREATE INDEX "StockLocation_archivedAt_idx" ON "StockLocation"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_teamId_name_key" ON "StockLocation"("teamId", "name");

-- CreateIndex
CREATE INDEX "StockLocationProperty_stockLocationId_idx" ON "StockLocationProperty"("stockLocationId");

-- CreateIndex
CREATE INDEX "StockLocationProperty_propertyId_idx" ON "StockLocationProperty"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocationProperty_stockLocationId_propertyId_key" ON "StockLocationProperty"("stockLocationId", "propertyId");

-- CreateIndex
CREATE INDEX "SupplyItem_teamId_idx" ON "SupplyItem"("teamId");

-- CreateIndex
CREATE INDEX "SupplyItem_baseUnitId_idx" ON "SupplyItem"("baseUnitId");

-- CreateIndex
CREATE INDEX "SupplyItem_category_idx" ON "SupplyItem"("category");

-- CreateIndex
CREATE INDEX "SupplyItem_archivedAt_idx" ON "SupplyItem"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SupplyItem_teamId_name_key" ON "SupplyItem"("teamId", "name");

-- CreateIndex
CREATE INDEX "Sku_teamId_idx" ON "Sku"("teamId");

-- CreateIndex
CREATE INDEX "Sku_supplyItemId_idx" ON "Sku"("supplyItemId");

-- CreateIndex
CREATE INDEX "Sku_stockLocationId_idx" ON "Sku"("stockLocationId");

-- CreateIndex
CREATE INDEX "Sku_archivedAt_idx" ON "Sku"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_stockLocationId_name_key" ON "Sku"("stockLocationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StockOnHand_skuId_key" ON "StockOnHand"("skuId");

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocationProperty" ADD CONSTRAINT "StockLocationProperty_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocationProperty" ADD CONSTRAINT "StockLocationProperty_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyItem" ADD CONSTRAINT "SupplyItem_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_supplyItemId_fkey" FOREIGN KEY ("supplyItemId") REFERENCES "SupplyItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockOnHand" ADD CONSTRAINT "StockOnHand_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed shared units of measure
INSERT INTO "UnitOfMeasure" ("id", "code", "name", "dimension", "createdAt", "updatedAt") VALUES
  ('uom_ea', 'ea', 'Each', 'count', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('uom_pack', 'pack', 'Pack', 'count', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('uom_ml', 'ml', 'Millilitre', 'volume', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('uom_l', 'l', 'Litre', 'volume', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('uom_g', 'g', 'Gram', 'mass', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('uom_kg', 'kg', 'Kilogram', 'mass', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
