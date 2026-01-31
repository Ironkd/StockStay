-- AlterTable: add signup and email verification fields to User
ALTER TABLE "User" ADD COLUMN "address" TEXT DEFAULT '';
ALTER TABLE "User" ADD COLUMN "phone" TEXT DEFAULT '';
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3);

-- Set existing users (e.g. demo) as verified so they can still log in
UPDATE "User" SET "emailVerified" = true;

-- CreateIndex
CREATE INDEX "User_emailVerificationToken_idx" ON "User"("emailVerificationToken");
