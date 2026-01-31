-- AlterTable
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "isOnTrial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "trialPlan" TEXT;

-- Update plan field to support new plan types
-- Existing teams remain on their current plan

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Team_isOnTrial_idx" ON "Team"("isOnTrial");
CREATE INDEX IF NOT EXISTS "Team_trialEndsAt_idx" ON "Team"("trialEndsAt");
