-- Shared SKUs: move location + last purchase rate onto StockOnHand

-- 1. Add nullable location + last-price columns on StockOnHand
ALTER TABLE "StockOnHand" ADD COLUMN "stockLocationId" TEXT;
ALTER TABLE "StockOnHand" ADD COLUMN "lastPurchasePrice" DECIMAL(18,4);
ALTER TABLE "StockOnHand" ADD COLUMN "lastUnitRate" DECIMAL(18,6);

-- 2–3. Backfill from Sku
UPDATE "StockOnHand" AS soh
SET
  "stockLocationId" = s."stockLocationId",
  "lastPurchasePrice" = s."purchasePrice",
  "lastUnitRate" = s."unitRate"
FROM "Sku" AS s
WHERE soh."skuId" = s."id";

-- 4. Require location; FK + unique (sku, location)
ALTER TABLE "StockOnHand" ALTER COLUMN "stockLocationId" SET NOT NULL;

ALTER TABLE "StockOnHand"
  ADD CONSTRAINT "StockOnHand_stockLocationId_fkey"
  FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Drop 1:1 unique on skuId; add composite unique
DROP INDEX IF EXISTS "StockOnHand_skuId_key";
CREATE UNIQUE INDEX "StockOnHand_skuId_stockLocationId_key"
  ON "StockOnHand"("skuId", "stockLocationId");
CREATE INDEX "StockOnHand_stockLocationId_idx" ON "StockOnHand"("stockLocationId");

-- 6. Rename colliding SKU names within a team before team-wide unique
WITH ranked AS (
  SELECT
    s."id",
    s."teamId",
    s."name",
    s."createdAt",
    loc."name" AS location_name,
    ROW_NUMBER() OVER (
      PARTITION BY s."teamId", s."name"
      ORDER BY s."createdAt" ASC, s."id" ASC
    ) AS rn
  FROM "Sku" s
  JOIN "StockLocation" loc ON loc."id" = s."stockLocationId"
)
UPDATE "Sku" AS s
SET "name" = ranked."name" || ' (' || ranked.location_name || ')'
FROM ranked
WHERE s."id" = ranked."id"
  AND ranked.rn > 1;

-- 7. Drop location from Sku; add team-wide name unique
DROP INDEX IF EXISTS "Sku_stockLocationId_name_key";
DROP INDEX IF EXISTS "Sku_stockLocationId_idx";

ALTER TABLE "Sku" DROP CONSTRAINT IF EXISTS "Sku_stockLocationId_fkey";
ALTER TABLE "Sku" DROP COLUMN "stockLocationId";

CREATE UNIQUE INDEX "Sku_teamId_name_key" ON "Sku"("teamId", "name");
