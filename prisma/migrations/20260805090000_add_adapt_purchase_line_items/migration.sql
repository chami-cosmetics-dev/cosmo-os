-- AlterTable
ALTER TABLE "AdaptPurchaseHistory" ADD COLUMN IF NOT EXISTS "lineItems" JSONB;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdaptPurchaseHistory_companyId_salesInvoiceMasterId_idx" ON "AdaptPurchaseHistory"("companyId", "salesInvoiceMasterId");
