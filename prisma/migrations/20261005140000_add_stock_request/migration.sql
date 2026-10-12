-- CreateTable
CREATE TABLE "StockRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyLocationId" TEXT,
    "shopifyStoreHandle" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "shopifyProductId" TEXT,
    "shopifyInventoryItemId" TEXT,
    "shopifyCustomerId" TEXT,
    "sku" TEXT,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "productUrl" TEXT,
    "shopName" TEXT,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "remark" TEXT,
    "soldFromInstanceId" TEXT,
    "soldFromWarehouse" TEXT,
    "stockLookupStatus" TEXT NOT NULL DEFAULT 'pending',
    "stockLookupAt" TIMESTAMP(3),
    "stockLookupJson" JSONB,
    "stockLookupError" TEXT,
    "availabilityEmailSentAt" TIMESTAMP(3),
    "restockEmailSentAt" TIMESTAMP(3),
    "restockEmailError" TEXT,
    "lastActionById" TEXT,
    "lastActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockRequest_companyId_status_createdAt_idx" ON "StockRequest"("companyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockRequest_companyId_shopifyVariantId_customerPhone_idx" ON "StockRequest"("companyId", "shopifyVariantId", "customerPhone");

-- CreateIndex
CREATE INDEX "StockRequest_shopifyInventoryItemId_restockEmailSentAt_idx" ON "StockRequest"("shopifyInventoryItemId", "restockEmailSentAt");

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockRequest" ADD CONSTRAINT "StockRequest_lastActionById_fkey" FOREIGN KEY ("lastActionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

