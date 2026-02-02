-- AlterTable: Starter plan can have 0–2 extra user slots ($5/mo each)
ALTER TABLE "Team" ADD COLUMN IF NOT EXISTS "extraUserSlots" INTEGER DEFAULT 0;
