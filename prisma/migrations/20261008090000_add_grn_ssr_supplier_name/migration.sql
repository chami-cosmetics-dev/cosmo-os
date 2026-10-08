ALTER TABLE "GrnSupplierStockReturn" ADD COLUMN "supplierName" TEXT;

CREATE INDEX "GrnSupplierStockReturn_companyId_supplierName_idx" ON "GrnSupplierStockReturn"("companyId", "supplierName");
