-- Idempotent migration script for Supabase (PostgreSQL)
-- Run this in Supabase SQL Editor if you prefer not to use prisma migrate deploy.
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks where needed).

-- ----- Team: plan and limits -----
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "maxWarehouses" INTEGER;

-- ----- Team: trial -----
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "isOnTrial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "trialPlan" TEXT;

-- ----- Team: Stripe billing -----
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "stripeSubscriptionStatus" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "billingInterval" TEXT;

-- ----- Team: invoice branding -----
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "invoiceLogoUrl" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "invoiceStyle" TEXT;

-- ----- Team indexes -----
CREATE INDEX IF NOT EXISTS "Team_isOnTrial_idx" ON "Team"("isOnTrial");
CREATE INDEX IF NOT EXISTS "Team_trialEndsAt_idx" ON "Team"("trialEndsAt");
CREATE INDEX IF NOT EXISTS "Team_stripeCustomerId_idx" ON "Team"("stripeCustomerId");

-- ----- Invoice: saleId (links invoice to sale) -----
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "saleId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_saleId_key" ON "Invoice"("saleId");
CREATE INDEX IF NOT EXISTS "Invoice_saleId_idx" ON "Invoice"("saleId");

-- ----- Client, Invoice, Sale: teamId -----
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
CREATE INDEX IF NOT EXISTS "Client_teamId_idx" ON "Client"("teamId");
CREATE INDEX IF NOT EXISTS "Invoice_teamId_idx" ON "Invoice"("teamId");
CREATE INDEX IF NOT EXISTS "Sale_teamId_idx" ON "Sale"("teamId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_teamId_fkey') THEN
    ALTER TABLE "Client" ADD CONSTRAINT "Client_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_teamId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sale_teamId_fkey') THEN
    ALTER TABLE "Sale" ADD CONSTRAINT "Sale_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ----- User: profile fields -----
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streetAddress" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "province" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
