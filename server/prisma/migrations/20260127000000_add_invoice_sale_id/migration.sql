-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "saleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_saleId_key" ON "Invoice"("saleId");

-- CreateIndex
CREATE INDEX "Invoice_saleId_idx" ON "Invoice"("saleId");
