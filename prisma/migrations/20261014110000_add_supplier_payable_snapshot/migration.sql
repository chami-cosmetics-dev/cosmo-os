CREATE TABLE "SupplierPayableSnapshot" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "erpnextInstanceId" TEXT NOT NULL,
  "erpSlot" TEXT,
  "erpLabel" TEXT,
  "erpCompany" TEXT NOT NULL,
  "reportDate" TEXT NOT NULL,
  "suppliers" JSONB NOT NULL DEFAULT '[]',
  "rows" JSONB NOT NULL DEFAULT '[]',
  "error" TEXT,
  "lastSuccessAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupplierPayableSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierPayableSnapshot_companyId_erpnextInstanceId_erpCompany_reportDate_key"
  ON "SupplierPayableSnapshot"("companyId", "erpnextInstanceId", "erpCompany", "reportDate");

CREATE INDEX "SupplierPayableSnapshot_companyId_reportDate_idx"
  ON "SupplierPayableSnapshot"("companyId", "reportDate");

CREATE INDEX "SupplierPayableSnapshot_companyId_updatedAt_idx"
  ON "SupplierPayableSnapshot"("companyId", "updatedAt" DESC);

ALTER TABLE "SupplierPayableSnapshot"
  ADD CONSTRAINT "SupplierPayableSnapshot_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierPayableSnapshot"
  ADD CONSTRAINT "SupplierPayableSnapshot_erpnextInstanceId_fkey"
  FOREIGN KEY ("erpnextInstanceId") REFERENCES "ErpnextInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
