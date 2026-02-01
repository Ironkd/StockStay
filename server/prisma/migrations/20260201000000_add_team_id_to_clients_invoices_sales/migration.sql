-- AlterTable
ALTER TABLE "Client" ADD COLUMN "teamId" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "teamId" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "teamId" TEXT;

-- CreateIndex
CREATE INDEX "Client_teamId_idx" ON "Client"("teamId");

-- CreateIndex
CREATE INDEX "Invoice_teamId_idx" ON "Invoice"("teamId");

-- CreateIndex
CREATE INDEX "Sale_teamId_idx" ON "Sale"("teamId");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
