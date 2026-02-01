-- Add first/last name and separate address fields to User for profile
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streetAddress" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "province" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
