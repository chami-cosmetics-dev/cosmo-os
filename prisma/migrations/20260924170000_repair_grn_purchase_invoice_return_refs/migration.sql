ALTER TABLE "GrnPurchaseInvoice"
  ADD COLUMN IF NOT EXISTS "isReturn" INTEGER,
  ADD COLUMN IF NOT EXISTS "returnAgainst" TEXT,
  ADD COLUMN IF NOT EXISTS "billNo" TEXT;

CREATE INDEX IF NOT EXISTS "GrnPurchaseInvoice_companyId_returnAgainst_idx"
  ON "GrnPurchaseInvoice"("companyId", "returnAgainst");

CREATE INDEX IF NOT EXISTS "GrnPurchaseInvoice_companyId_billNo_idx"
  ON "GrnPurchaseInvoice"("companyId", "billNo");
