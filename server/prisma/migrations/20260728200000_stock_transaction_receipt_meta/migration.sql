-- AlterTable
ALTER TABLE "StockTransaction" ADD COLUMN IF NOT EXISTS "effectiveAt" TIMESTAMP(3);
ALTER TABLE "StockTransaction" ADD COLUMN IF NOT EXISTS "unitPrice" DECIMAL(18,4);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockTransaction_teamId_effectiveAt_idx" ON "StockTransaction"("teamId", "effectiveAt");
