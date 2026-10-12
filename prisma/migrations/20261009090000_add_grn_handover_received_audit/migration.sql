ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "handoverReceivedAt" TIMESTAMP(3);
ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "handoverReceivedById" TEXT;

CREATE INDEX "GrnPurchaseReceipt_handoverReceivedById_idx" ON "GrnPurchaseReceipt"("handoverReceivedById");

ALTER TABLE "GrnPurchaseReceipt"
  ADD CONSTRAINT "GrnPurchaseReceipt_handoverReceivedById_fkey"
  FOREIGN KEY ("handoverReceivedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
