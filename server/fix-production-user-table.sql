-- One-time fix: add User columns if production DB is missing them (P2022 ColumnNotFound).
-- Run this in Supabase SQL Editor: Dashboard → SQL Editor → New query → paste → Run.
-- Safe to run multiple times (IF NOT EXISTS / DO block).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'address') THEN
    ALTER TABLE "User" ADD COLUMN "address" TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'phone') THEN
    ALTER TABLE "User" ADD COLUMN "phone" TEXT DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'emailVerified') THEN
    ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'emailVerificationToken') THEN
    ALTER TABLE "User" ADD COLUMN "emailVerificationToken" TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'emailVerificationExpiresAt') THEN
    ALTER TABLE "User" ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3);
  END IF;
END $$;

UPDATE "User" SET "emailVerified" = true WHERE "emailVerified" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "User_emailVerificationToken_idx" ON "User"("emailVerificationToken");
