-- Contact Master purchase-summary cache (nightly / manual refresh; export reads these).
ALTER TABLE "ContactMaster"
  ADD COLUMN IF NOT EXISTS "purchaseOrderCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "purchaseTotalValue" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "purchaseLastOrderAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CompanyContactPurchaseSummarySync" (
  "companyId" TEXT NOT NULL,
  "lastSyncedAt" TIMESTAMP(3),
  "lastSyncError" TEXT,
  "contactCount" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyContactPurchaseSummarySync_pkey" PRIMARY KEY ("companyId")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'CompanyContactPurchaseSummarySync_companyId_fkey'
  ) THEN
    ALTER TABLE "CompanyContactPurchaseSummarySync"
      ADD CONSTRAINT "CompanyContactPurchaseSummarySync_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
