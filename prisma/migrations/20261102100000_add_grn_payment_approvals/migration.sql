CREATE TABLE "GrnPaymentApproval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseReceiptName" TEXT NOT NULL,
    "purchaseReceiptIsBackfill" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnPaymentApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnPaymentApproval_receipt_key"
ON "GrnPaymentApproval"("companyId", "purchaseReceiptName", "purchaseReceiptIsBackfill");

CREATE INDEX "GrnPaymentApproval_receipt_lookup_idx"
ON "GrnPaymentApproval"("companyId", "purchaseReceiptIsBackfill", "purchaseReceiptName");

CREATE INDEX "GrnPaymentApproval_approved_at_idx"
ON "GrnPaymentApproval"("companyId", "approvedAt");
