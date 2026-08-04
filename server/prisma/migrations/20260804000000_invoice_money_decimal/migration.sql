-- AlterTable: Invoice money fields Float -> Decimal(12, 2)
ALTER TABLE "Invoice" ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(12,2) USING ROUND("subtotal"::numeric, 2);
ALTER TABLE "Invoice" ALTER COLUMN "tax" SET DATA TYPE DECIMAL(12,2) USING ROUND("tax"::numeric, 2);
ALTER TABLE "Invoice" ALTER COLUMN "total" SET DATA TYPE DECIMAL(12,2) USING ROUND("total"::numeric, 2);
