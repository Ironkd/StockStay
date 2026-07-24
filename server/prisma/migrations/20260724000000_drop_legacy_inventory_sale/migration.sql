-- Drop legacy Inventory / Sale / InventoryMovement models (Appendix A #10).
-- Property.items, Team.sales, and Invoice.saleId no longer exist in schema.prisma.

DROP TABLE IF EXISTS "InventoryMovement";
DROP TABLE IF EXISTS "Inventory";
DROP TABLE IF EXISTS "Sale";

-- drop saleId from Invoice if exists
ALTER TABLE "Invoice" DROP COLUMN IF EXISTS "saleId";
