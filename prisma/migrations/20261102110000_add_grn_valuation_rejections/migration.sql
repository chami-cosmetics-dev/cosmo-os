ALTER TABLE "GrnPurchaseReceipt"
  ADD COLUMN "valuationRejectedAt" TIMESTAMP(3),
  ADD COLUMN "valuationRejectedById" TEXT;

ALTER TABLE "GrnBackfillPurchaseReceipt"
  ADD COLUMN "valuationRejectedAt" TIMESTAMP(3),
  ADD COLUMN "valuationRejectedById" TEXT;
