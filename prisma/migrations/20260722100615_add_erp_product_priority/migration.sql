-- AlterTable
ALTER TABLE "ProductItem" ADD COLUMN     "erp1ProductPriority" TEXT,
ADD COLUMN     "erp2ProductPriority" TEXT,
ADD COLUMN     "erpPrioritySyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ProductItem_companyId_erp1ProductPriority_idx" ON "ProductItem"("companyId", "erp1ProductPriority");

-- CreateIndex
CREATE INDEX "ProductItem_companyId_erp2ProductPriority_idx" ON "ProductItem"("companyId", "erp2ProductPriority");
