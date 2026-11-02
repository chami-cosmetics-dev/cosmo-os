CREATE TABLE "GrnMarginApproval" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseReceiptName" TEXT NOT NULL,
    "purchaseReceiptIsBackfill" BOOLEAN NOT NULL DEFAULT false,
    "itemCode" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnMarginApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnMarginApproval_receipt_item_key"
ON "GrnMarginApproval"("companyId", "purchaseReceiptName", "purchaseReceiptIsBackfill", "itemCode");

CREATE INDEX "GrnMarginApproval_receipt_lookup_idx"
ON "GrnMarginApproval"("companyId", "purchaseReceiptIsBackfill", "purchaseReceiptName");

CREATE INDEX "GrnMarginApproval_approved_at_idx"
ON "GrnMarginApproval"("companyId", "approvedAt");
