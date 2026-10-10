-- AlterTable
ALTER TABLE "StockRequest" ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "restockedAt" TIMESTAMP(3),
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'shopify',
ALTER COLUMN "shopifyVariantId" DROP NOT NULL,
ALTER COLUMN "customerEmail" DROP NOT NULL,
ALTER COLUMN "customerPhone" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "StockRequest_shopifyStoreHandle_sku_idx" ON "StockRequest"("shopifyStoreHandle", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "StockRequest_companyId_externalRef_key" ON "StockRequest"("companyId", "externalRef");

