-- AlterTable (idempotent: skip if column already exists)
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "teamId" TEXT;

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "Client_teamId_idx" ON "Client"("teamId");
CREATE INDEX IF NOT EXISTS "Invoice_teamId_idx" ON "Invoice"("teamId");
CREATE INDEX IF NOT EXISTS "Sale_teamId_idx" ON "Sale"("teamId");

-- AddForeignKey (idempotent: only add if constraint does not exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_teamId_fkey') THEN
    ALTER TABLE "Client" ADD CONSTRAINT "Client_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Invoice_teamId_fkey') THEN
    ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Sale_teamId_fkey') THEN
    ALTER TABLE "Sale" ADD CONSTRAINT "Sale_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
