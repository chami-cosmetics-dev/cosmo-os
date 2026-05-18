-- CreateTable: ContactAllocationOption
CREATE TABLE "ContactAllocationOption" (
  "id"        TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "type"      TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactAllocationOption_pkey" PRIMARY KEY ("id")
);

-- Unique constraint
CREATE UNIQUE INDEX "ContactAllocationOption_companyId_type_value_key"
  ON "ContactAllocationOption"("companyId", "type", "value");

-- Index for type lookups
CREATE INDEX "ContactAllocationOption_companyId_type_idx"
  ON "ContactAllocationOption"("companyId", "type");

-- Foreign key to Company
ALTER TABLE "ContactAllocationOption"
  ADD CONSTRAINT "ContactAllocationOption_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
