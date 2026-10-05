ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "handoverRevertedAt" TIMESTAMP(3);
ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "handoverRevertedById" TEXT;
ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "valuedRevertedAt" TIMESTAMP(3);
ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "valuedRevertedById" TEXT;
ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "receivedRevertedAt" TIMESTAMP(3);
ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "receivedRevertedById" TEXT;

CREATE INDEX "GrnPurchaseReceipt_handoverRevertedById_idx" ON "GrnPurchaseReceipt"("handoverRevertedById");
CREATE INDEX "GrnPurchaseReceipt_valuedRevertedById_idx" ON "GrnPurchaseReceipt"("valuedRevertedById");
CREATE INDEX "GrnPurchaseReceipt_receivedRevertedById_idx" ON "GrnPurchaseReceipt"("receivedRevertedById");

ALTER TABLE "GrnPurchaseReceipt" ADD CONSTRAINT "GrnPurchaseReceipt_handoverRevertedById_fkey" FOREIGN KEY ("handoverRevertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrnPurchaseReceipt" ADD CONSTRAINT "GrnPurchaseReceipt_valuedRevertedById_fkey" FOREIGN KEY ("valuedRevertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GrnPurchaseReceipt" ADD CONSTRAINT "GrnPurchaseReceipt_receivedRevertedById_fkey" FOREIGN KEY ("receivedRevertedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
