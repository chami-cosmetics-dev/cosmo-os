ALTER TABLE "GrnPurchaseInvoiceItem"
  ADD COLUMN "supplierStockReturn" TEXT,
  ADD COLUMN "supplierStockReturnItem" TEXT;

CREATE INDEX "GrnPurchaseInvoiceItem_companyId_supplierStockReturn_idx"
  ON "GrnPurchaseInvoiceItem"("companyId", "supplierStockReturn");
