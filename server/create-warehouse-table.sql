-- Add Warehouse table and plan fields to Supabase
-- Run this in Supabase SQL Editor

-- Add plan fields to Team table (if they don't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Team' AND column_name = 'plan'
  ) THEN
    ALTER TABLE "Team" ADD COLUMN "plan" TEXT DEFAULT 'free';
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Team' AND column_name = 'maxWarehouses'
  ) THEN
    ALTER TABLE "Team" ADD COLUMN "maxWarehouses" INTEGER;
  END IF;
END $$;

-- Create Warehouse table
CREATE TABLE IF NOT EXISTS "Warehouse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "teamId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- Create index on teamId
CREATE INDEX IF NOT EXISTS "Warehouse_teamId_idx" ON "Warehouse"("teamId");

-- Add foreign key constraint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'Warehouse_teamId_fkey'
  ) THEN
    ALTER TABLE "Warehouse" 
    ADD CONSTRAINT "Warehouse_teamId_fkey" 
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") 
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Update Inventory table to add warehouse relation (if needed)
-- The warehouseId column should already exist from before

-- Set default plan for existing teams
UPDATE "Team" SET "plan" = 'free' WHERE "plan" IS NULL;
