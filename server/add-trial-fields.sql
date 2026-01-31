-- Add trial fields to Team table
-- Run this in your Supabase SQL Editor

-- Add new columns
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "isOnTrial" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "trialPlan" TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "Team_isOnTrial_idx" ON "Team"("isOnTrial");
CREATE INDEX IF NOT EXISTS "Team_trialEndsAt_idx" ON "Team"("trialEndsAt");

-- Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'Team' 
AND column_name IN ('isOnTrial', 'trialEndsAt', 'trialPlan')
ORDER BY column_name;
