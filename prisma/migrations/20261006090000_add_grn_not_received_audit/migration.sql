ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "notReceivedAt" TIMESTAMP(3);
ALTER TABLE "GrnPurchaseReceipt" ADD COLUMN "notReceivedById" TEXT;

CREATE INDEX "GrnPurchaseReceipt_notReceivedById_idx" ON "GrnPurchaseReceipt"("notReceivedById");

ALTER TABLE "GrnPurchaseReceipt" ADD CONSTRAINT "GrnPurchaseReceipt_notReceivedById_fkey" FOREIGN KEY ("notReceivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
