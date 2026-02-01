-- AlterTable: add reorderQuantity to Inventory (quantity to order when reordering)
ALTER TABLE "Inventory" ADD COLUMN IF NOT EXISTS "reorderQuantity" DOUBLE PRECISION NOT NULL DEFAULT 0;
