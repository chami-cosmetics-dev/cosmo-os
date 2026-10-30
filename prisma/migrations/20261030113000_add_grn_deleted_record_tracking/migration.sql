ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "GrnSupplierStockReturn" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "GrnPurchaseInvoice" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "GrnBackfillPurchaseReceipt" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "GrnBackfillSupplierStockReturn" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "GrnBackfillPurchaseInvoice" ADD COLUMN "deletedAt" TIMESTAMP(3);
