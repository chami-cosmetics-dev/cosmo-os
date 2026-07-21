-- CreateTable
CREATE TABLE "ShopifyAbandonedCheckout" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shopifyCheckoutGid" TEXT NOT NULL,
    "shopifyCheckoutId" TEXT NOT NULL,
    "shopifyAdminStoreHandle" TEXT NOT NULL,
    "companyLocationId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "lineItemsSummary" TEXT NOT NULL,
    "lineItemsJson" JSONB,
    "totalPrice" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "abandonedAt" TIMESTAMP(3) NOT NULL,
    "shopifyUpdatedAt" TIMESTAMP(3),
    "shopifyCompletedAt" TIMESTAMP(3),
    "shopifyRecoveredAt" TIMESTAMP(3),
    "abandonedCheckoutUrl" TEXT,
    "followUpStatus" TEXT NOT NULL DEFAULT 'pending',
    "customerResponse" TEXT,
    "remark" TEXT,
    "lastFollowUpById" TEXT,
    "lastFollowUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopifyAbandonedCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAbandonedCheckoutSync" (
    "companyId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAbandonedCheckoutSync_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "ShopifyAbandonedCheckout_companyId_followUpStatus_abandoned_idx" ON "ShopifyAbandonedCheckout"("companyId", "followUpStatus", "abandonedAt" DESC);

-- CreateIndex
CREATE INDEX "ShopifyAbandonedCheckout_companyId_abandonedAt_idx" ON "ShopifyAbandonedCheckout"("companyId", "abandonedAt" DESC);

-- CreateIndex
CREATE INDEX "ShopifyAbandonedCheckout_companyId_customerResponse_idx" ON "ShopifyAbandonedCheckout"("companyId", "customerResponse");

-- CreateIndex
CREATE INDEX "ShopifyAbandonedCheckout_shopifyAdminStoreHandle_idx" ON "ShopifyAbandonedCheckout"("shopifyAdminStoreHandle");

-- CreateIndex
CREATE UNIQUE INDEX "ShopifyAbandonedCheckout_companyId_shopifyCheckoutGid_key" ON "ShopifyAbandonedCheckout"("companyId", "shopifyCheckoutGid");

-- AddForeignKey
ALTER TABLE "ShopifyAbandonedCheckout" ADD CONSTRAINT "ShopifyAbandonedCheckout_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyAbandonedCheckout" ADD CONSTRAINT "ShopifyAbandonedCheckout_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopifyAbandonedCheckout" ADD CONSTRAINT "ShopifyAbandonedCheckout_lastFollowUpById_fkey" FOREIGN KEY ("lastFollowUpById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAbandonedCheckoutSync" ADD CONSTRAINT "CompanyAbandonedCheckoutSync_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
