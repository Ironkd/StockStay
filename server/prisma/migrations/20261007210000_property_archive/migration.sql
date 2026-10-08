ALTER TABLE "Property" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Property_archivedAt_idx" ON "Property"("archivedAt");
