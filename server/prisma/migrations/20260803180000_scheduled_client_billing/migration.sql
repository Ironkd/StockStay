-- AlterTable
ALTER TABLE "Team" ADD COLUMN "billingTimezone" TEXT NOT NULL DEFAULT 'America/Toronto';

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "billingPeriodStart" TIMESTAMP(3),
ADD COLUMN "billingPeriodEnd" TIMESTAMP(3),
ADD COLUMN "taxRate" DECIMAL(9,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "items" SET DEFAULT '[]';

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "propertyId" TEXT,
    "replenishmentLineId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitPrice" DECIMAL(18,6) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_replenishmentLineId_key" ON "InvoiceLine"("replenishmentLineId");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLine_propertyId_idx" ON "InvoiceLine"("propertyId");

-- CreateIndex
CREATE INDEX "Invoice_teamId_clientId_billingPeriodStart_idx" ON "Invoice"("teamId", "clientId", "billingPeriodStart");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_replenishmentLineId_fkey" FOREIGN KEY ("replenishmentLineId") REFERENCES "ReplenishmentLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
