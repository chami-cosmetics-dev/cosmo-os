ALTER TABLE "GrnPurchaseReceipt"
  ADD COLUMN "requiresValuationConfirmation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "GrnBackfillPurchaseReceipt"
  ADD COLUMN "requiresValuationConfirmation" BOOLEAN NOT NULL DEFAULT false;
