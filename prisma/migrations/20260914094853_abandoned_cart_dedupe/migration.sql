-- AlterTable
ALTER TABLE "ShopifyAbandonedCheckout" ADD COLUMN     "abandonmentReason" TEXT,
ADD COLUMN     "cartFingerprint" TEXT,
ADD COLUMN     "exactDuplicateGroupId" TEXT,
ADD COLUMN     "phoneNormalized" TEXT,
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededByCheckoutId" TEXT;

-- CreateIndex
CREATE INDEX "ShopifyAbandonedCheckout_companyId_phoneNormalized_abandone_idx" ON "ShopifyAbandonedCheckout"("companyId", "phoneNormalized", "abandonedAt");

-- CreateIndex
CREATE INDEX "ShopifyAbandonedCheckout_companyId_phoneNormalized_cartFing_idx" ON "ShopifyAbandonedCheckout"("companyId", "phoneNormalized", "cartFingerprint");

-- CreateIndex
CREATE INDEX "ShopifyAbandonedCheckout_companyId_exactDuplicateGroupId_idx" ON "ShopifyAbandonedCheckout"("companyId", "exactDuplicateGroupId");

-- CreateIndex
CREATE INDEX "ShopifyAbandonedCheckout_companyId_supersededByCheckoutId_idx" ON "ShopifyAbandonedCheckout"("companyId", "supersededByCheckoutId");

-- AddForeignKey
ALTER TABLE "ShopifyAbandonedCheckout" ADD CONSTRAINT "ShopifyAbandonedCheckout_supersededByCheckoutId_fkey" FOREIGN KEY ("supersededByCheckoutId") REFERENCES "ShopifyAbandonedCheckout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
