-- Add invoice branding fields to Team (logo URL and style JSON)
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "invoiceLogoUrl" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "invoiceStyle" TEXT;
