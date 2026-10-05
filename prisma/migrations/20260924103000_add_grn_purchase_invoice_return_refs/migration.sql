ALTER TABLE "GrnPurchaseInvoice"
  ADD COLUMN "isReturn" INTEGER,
  ADD COLUMN "returnAgainst" TEXT,
  ADD COLUMN "billNo" TEXT;

CREATE INDEX "GrnPurchaseInvoice_companyId_returnAgainst_idx"
  ON "GrnPurchaseInvoice"("companyId", "returnAgainst");

CREATE INDEX "GrnPurchaseInvoice_companyId_billNo_idx"
  ON "GrnPurchaseInvoice"("companyId", "billNo");
