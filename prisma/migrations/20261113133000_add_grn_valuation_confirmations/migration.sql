ALTER TABLE "GrnPurchaseReceipt"
  ADD COLUMN "valuationConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "valuationConfirmedById" TEXT,
  ADD COLUMN "valuationConfirmRevertedAt" TIMESTAMP(3),
  ADD COLUMN "valuationConfirmRevertedById" TEXT;

ALTER TABLE "GrnBackfillPurchaseReceipt"
  ADD COLUMN "valuationConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "valuationConfirmedById" TEXT,
  ADD COLUMN "valuationConfirmRevertedAt" TIMESTAMP(3),
  ADD COLUMN "valuationConfirmRevertedById" TEXT;

CREATE INDEX "GrnPurchaseReceipt_valuationConfirmedById_idx" ON "GrnPurchaseReceipt"("valuationConfirmedById");
CREATE INDEX "GrnPurchaseReceipt_valuationConfirmRevertedById_idx" ON "GrnPurchaseReceipt"("valuationConfirmRevertedById");
CREATE INDEX "GrnBackfillPurchaseReceipt_valuationConfirmedById_idx" ON "GrnBackfillPurchaseReceipt"("valuationConfirmedById");
CREATE INDEX "GrnBackfillPurchaseReceipt_valuationConfirmRevertedById_idx" ON "GrnBackfillPurchaseReceipt"("valuationConfirmRevertedById");

ALTER TABLE "GrnPurchaseReceipt"
  ADD CONSTRAINT "GrnPurchaseReceipt_valuationConfirmedById_fkey"
  FOREIGN KEY ("valuationConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "GrnPurchaseReceipt_valuationConfirmRevertedById_fkey"
  FOREIGN KEY ("valuationConfirmRevertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrnBackfillPurchaseReceipt"
  ADD CONSTRAINT "GrnBackfillPurchaseReceipt_valuationConfirmedById_fkey"
  FOREIGN KEY ("valuationConfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "GrnBackfillPurchaseReceipt_valuationConfirmRevertedById_fkey"
  FOREIGN KEY ("valuationConfirmRevertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
