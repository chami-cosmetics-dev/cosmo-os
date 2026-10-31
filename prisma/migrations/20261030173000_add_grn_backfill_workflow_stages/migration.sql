ALTER TABLE "GrnBackfillPurchaseReceipt"
  ADD COLUMN "handoverAt" TIMESTAMP(3),
  ADD COLUMN "handoverById" TEXT,
  ADD COLUMN "handoverRevertedAt" TIMESTAMP(3),
  ADD COLUMN "handoverRevertedById" TEXT,
  ADD COLUMN "handoverReceivedAt" TIMESTAMP(3),
  ADD COLUMN "handoverReceivedById" TEXT,
  ADD COLUMN "notReceivedAt" TIMESTAMP(3),
  ADD COLUMN "notReceivedById" TEXT,
  ADD COLUMN "valuedAt" TIMESTAMP(3),
  ADD COLUMN "valuedById" TEXT,
  ADD COLUMN "valuedRevertedAt" TIMESTAMP(3),
  ADD COLUMN "valuedRevertedById" TEXT,
  ADD COLUMN "receivedAt" TIMESTAMP(3),
  ADD COLUMN "receivedById" TEXT,
  ADD COLUMN "receivedRevertedAt" TIMESTAMP(3),
  ADD COLUMN "receivedRevertedById" TEXT;

CREATE INDEX "GrnBackfillPurchaseReceipt_handoverById_idx" ON "GrnBackfillPurchaseReceipt"("handoverById");
CREATE INDEX "GrnBackfillPurchaseReceipt_handoverRevertedById_idx" ON "GrnBackfillPurchaseReceipt"("handoverRevertedById");
CREATE INDEX "GrnBackfillPurchaseReceipt_handoverReceivedById_idx" ON "GrnBackfillPurchaseReceipt"("handoverReceivedById");
CREATE INDEX "GrnBackfillPurchaseReceipt_notReceivedById_idx" ON "GrnBackfillPurchaseReceipt"("notReceivedById");
CREATE INDEX "GrnBackfillPurchaseReceipt_valuedById_idx" ON "GrnBackfillPurchaseReceipt"("valuedById");
CREATE INDEX "GrnBackfillPurchaseReceipt_valuedRevertedById_idx" ON "GrnBackfillPurchaseReceipt"("valuedRevertedById");
CREATE INDEX "GrnBackfillPurchaseReceipt_receivedById_idx" ON "GrnBackfillPurchaseReceipt"("receivedById");
CREATE INDEX "GrnBackfillPurchaseReceipt_receivedRevertedById_idx" ON "GrnBackfillPurchaseReceipt"("receivedRevertedById");

ALTER TABLE "GrnBackfillPurchaseReceipt" ADD CONSTRAINT "GrnBackfillPurchaseReceipt_handoverById_fkey" FOREIGN KEY ("handoverById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrnBackfillPurchaseReceipt" ADD CONSTRAINT "GrnBackfillPurchaseReceipt_handoverRevertedById_fkey" FOREIGN KEY ("handoverRevertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrnBackfillPurchaseReceipt" ADD CONSTRAINT "GrnBackfillPurchaseReceipt_handoverReceivedById_fkey" FOREIGN KEY ("handoverReceivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrnBackfillPurchaseReceipt" ADD CONSTRAINT "GrnBackfillPurchaseReceipt_notReceivedById_fkey" FOREIGN KEY ("notReceivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrnBackfillPurchaseReceipt" ADD CONSTRAINT "GrnBackfillPurchaseReceipt_valuedById_fkey" FOREIGN KEY ("valuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrnBackfillPurchaseReceipt" ADD CONSTRAINT "GrnBackfillPurchaseReceipt_valuedRevertedById_fkey" FOREIGN KEY ("valuedRevertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrnBackfillPurchaseReceipt" ADD CONSTRAINT "GrnBackfillPurchaseReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrnBackfillPurchaseReceipt" ADD CONSTRAINT "GrnBackfillPurchaseReceipt_receivedRevertedById_fkey" FOREIGN KEY ("receivedRevertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
