-- Add Stripe billing fields to Team
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "stripeSubscriptionStatus" TEXT;

CREATE INDEX IF NOT EXISTS "Team_stripeCustomerId_idx" ON "Team"("stripeCustomerId");
