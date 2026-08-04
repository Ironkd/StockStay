-- AlterTable
ALTER TABLE "StockLocation" ADD COLUMN "visibleCategories" JSONB,
ADD COLUMN "showUncategorized" BOOLEAN NOT NULL DEFAULT true;
