-- Pre-fulfillment split-payment legs attached to one finance approval.
CREATE TABLE "ApprovalPaymentLine" (
    "id" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "erpPaymentEntryName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApprovalPaymentLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApprovalPaymentLine_approvalRequestId_paymentMethod_key"
ON "ApprovalPaymentLine"("approvalRequestId", "paymentMethod");

CREATE INDEX "ApprovalPaymentLine_approvalRequestId_createdAt_idx"
ON "ApprovalPaymentLine"("approvalRequestId", "createdAt");

ALTER TABLE "ApprovalPaymentLine"
ADD CONSTRAINT "ApprovalPaymentLine_approvalRequestId_fkey"
FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
