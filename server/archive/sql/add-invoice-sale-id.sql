-- Run this in Supabase SQL Editor (or your Postgres client) if your Invoice table
-- was created before saleId was added. This adds the column so sales can create linked invoices.

ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "saleId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_saleId_key" ON "Invoice"("saleId");
CREATE INDEX IF NOT EXISTS "Invoice_saleId_idx" ON "Invoice"("saleId");
