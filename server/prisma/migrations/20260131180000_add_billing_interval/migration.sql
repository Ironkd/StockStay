-- AlterTable: add billing interval from Stripe subscription
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "billingInterval" TEXT;
