-- Organization + UserMembership: migrate Team billing/branding and User membership fields

-- 1. Organization table
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "maxProperties" INTEGER,
    "extraUserSlots" INTEGER DEFAULT 0,
    "isOnTrial" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "trialPlan" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeSubscriptionStatus" TEXT,
    "billingInterval" TEXT,
    "invoiceLogoUrl" TEXT,
    "invoiceStyle" TEXT,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Organization_ownerId_idx" ON "Organization"("ownerId");
CREATE INDEX "Organization_isOnTrial_idx" ON "Organization"("isOnTrial");
CREATE INDEX "Organization_trialEndsAt_idx" ON "Organization"("trialEndsAt");
CREATE INDEX "Organization_stripeCustomerId_idx" ON "Organization"("stripeCustomerId");

-- 2. Backfill one Organization per Team (copy billing + branding)
INSERT INTO "Organization" (
    "id", "name", "ownerId", "createdAt", "updatedAt",
    "plan", "maxProperties", "extraUserSlots",
    "isOnTrial", "trialEndsAt", "trialPlan",
    "stripeCustomerId", "stripeSubscriptionId", "stripeSubscriptionStatus", "billingInterval",
    "invoiceLogoUrl", "invoiceStyle"
)
SELECT
    gen_random_uuid()::text,
    t."name",
    t."ownerId",
    t."createdAt",
    t."updatedAt",
    COALESCE(t."plan", 'free'),
    t."maxProperties",
    COALESCE(t."extraUserSlots", 0),
    COALESCE(t."isOnTrial", false),
    t."trialEndsAt",
    t."trialPlan",
    t."stripeCustomerId",
    t."stripeSubscriptionId",
    t."stripeSubscriptionStatus",
    t."billingInterval",
    t."invoiceLogoUrl",
    t."invoiceStyle"
FROM "Team" t;

-- Map team -> organization via temp table (org id is random; link by ownerId+name+createdAt uniqueness risk)
-- Safer: add temporary teamId column on Organization for migration, then drop.
ALTER TABLE "Organization" ADD COLUMN "legacyTeamId" TEXT;

UPDATE "Organization" o
SET "legacyTeamId" = t."id"
FROM "Team" t
WHERE o."ownerId" = t."ownerId"
  AND o."name" = t."name"
  AND o."createdAt" = t."createdAt"
  AND o."legacyTeamId" IS NULL;

-- Fallback for any unmatched (should be rare): match by stripe customer or row order
UPDATE "Organization" o
SET "legacyTeamId" = t."id"
FROM "Team" t
WHERE o."legacyTeamId" IS NULL
  AND t."stripeCustomerId" IS NOT NULL
  AND o."stripeCustomerId" = t."stripeCustomerId";

-- 3. Add organizationId to Team (nullable first)
ALTER TABLE "Team" ADD COLUMN "organizationId" TEXT;

UPDATE "Team" t
SET "organizationId" = o."id"
FROM "Organization" o
WHERE o."legacyTeamId" = t."id";

-- Any remaining teams without org: create org now
INSERT INTO "Organization" (
    "id", "name", "ownerId", "createdAt", "updatedAt",
    "plan", "maxProperties", "extraUserSlots",
    "isOnTrial", "trialEndsAt", "trialPlan",
    "stripeCustomerId", "stripeSubscriptionId", "stripeSubscriptionStatus", "billingInterval",
    "invoiceLogoUrl", "invoiceStyle", "legacyTeamId"
)
SELECT
    gen_random_uuid()::text,
    t."name",
    t."ownerId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    COALESCE(t."plan", 'free'),
    t."maxProperties",
    COALESCE(t."extraUserSlots", 0),
    COALESCE(t."isOnTrial", false),
    t."trialEndsAt",
    t."trialPlan",
    t."stripeCustomerId",
    t."stripeSubscriptionId",
    t."stripeSubscriptionStatus",
    t."billingInterval",
    t."invoiceLogoUrl",
    t."invoiceStyle",
    t."id"
FROM "Team" t
WHERE t."organizationId" IS NULL;

UPDATE "Team" t
SET "organizationId" = o."id"
FROM "Organization" o
WHERE t."organizationId" IS NULL
  AND o."legacyTeamId" = t."id";

ALTER TABLE "Team" ALTER COLUMN "organizationId" SET NOT NULL;

CREATE INDEX "Team_organizationId_idx" ON "Team"("organizationId");

ALTER TABLE "Team"
  ADD CONSTRAINT "Team_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. UserMembership table
CREATE TABLE "UserMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "teamRole" TEXT NOT NULL DEFAULT 'member',
    "maxInventoryItems" INTEGER,
    "allowedPages" TEXT,
    "allowedPropertyIds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserMembership_userId_teamId_key" ON "UserMembership"("userId", "teamId");
CREATE INDEX "UserMembership_userId_idx" ON "UserMembership"("userId");
CREATE INDEX "UserMembership_teamId_idx" ON "UserMembership"("teamId");

INSERT INTO "UserMembership" (
    "id", "userId", "teamId", "teamRole", "maxInventoryItems", "allowedPages", "allowedPropertyIds", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    u."id",
    u."teamId",
    COALESCE(u."teamRole", 'member'),
    u."maxInventoryItems",
    u."allowedPages",
    u."allowedPropertyIds",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User" u
WHERE u."teamId" IS NOT NULL;

-- 5. User.activeTeamId
ALTER TABLE "User" ADD COLUMN "activeTeamId" TEXT;

UPDATE "User" SET "activeTeamId" = "teamId" WHERE "teamId" IS NOT NULL;

CREATE INDEX "User_activeTeamId_idx" ON "User"("activeTeamId");

-- Drop old User team FK/index/columns
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_teamId_fkey";
DROP INDEX IF EXISTS "User_teamId_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "teamId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "teamRole";
ALTER TABLE "User" DROP COLUMN IF EXISTS "maxInventoryItems";
ALTER TABLE "User" DROP COLUMN IF EXISTS "allowedPages";
ALTER TABLE "User" DROP COLUMN IF EXISTS "allowedPropertyIds";

ALTER TABLE "User"
  ADD CONSTRAINT "User_activeTeamId_fkey"
  FOREIGN KEY ("activeTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. UserMembership FKs
ALTER TABLE "UserMembership"
  ADD CONSTRAINT "UserMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserMembership"
  ADD CONSTRAINT "UserMembership_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Organization owner FK (after User is stable)
ALTER TABLE "Organization"
  ADD CONSTRAINT "Organization_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Drop Team billing/branding columns and old indexes
DROP INDEX IF EXISTS "Team_isOnTrial_idx";
DROP INDEX IF EXISTS "Team_trialEndsAt_idx";
DROP INDEX IF EXISTS "Team_stripeCustomerId_idx";

ALTER TABLE "Team" DROP COLUMN IF EXISTS "plan";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "maxProperties";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "extraUserSlots";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "isOnTrial";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "trialEndsAt";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "trialPlan";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "stripeCustomerId";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "stripeSubscriptionId";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "stripeSubscriptionStatus";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "billingInterval";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "invoiceLogoUrl";
ALTER TABLE "Team" DROP COLUMN IF EXISTS "invoiceStyle";

-- 9. Cleanup migration helper column
ALTER TABLE "Organization" DROP COLUMN "legacyTeamId";
