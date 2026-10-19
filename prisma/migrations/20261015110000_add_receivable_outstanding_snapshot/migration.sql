CREATE TABLE "ReceivableOutstandingSnapshot" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "erpnextInstanceId" TEXT NOT NULL,
  "erpSlot" TEXT,
  "erpLabel" TEXT,
  "erpCompany" TEXT NOT NULL,
  "reportDate" TEXT NOT NULL,
  "rows" JSONB NOT NULL DEFAULT '[]',
  "error" TEXT,
  "lastSuccessAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReceivableOutstandingSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReceivableOutstandingSnapshot_companyId_erpnextInstanceId_erpCompany_reportDate_key"
  ON "ReceivableOutstandingSnapshot"("companyId", "erpnextInstanceId", "erpCompany", "reportDate");
CREATE INDEX "ReceivableOutstandingSnapshot_companyId_reportDate_idx"
  ON "ReceivableOutstandingSnapshot"("companyId", "reportDate");
CREATE INDEX "ReceivableOutstandingSnapshot_companyId_updatedAt_idx"
  ON "ReceivableOutstandingSnapshot"("companyId", "updatedAt" DESC);
ALTER TABLE "ReceivableOutstandingSnapshot"
  ADD CONSTRAINT "ReceivableOutstandingSnapshot_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReceivableOutstandingSnapshot"
  ADD CONSTRAINT "ReceivableOutstandingSnapshot_erpnextInstanceId_fkey"
  FOREIGN KEY ("erpnextInstanceId") REFERENCES "ErpnextInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
