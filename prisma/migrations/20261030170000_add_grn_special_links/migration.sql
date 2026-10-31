CREATE TABLE "GrnSpecialLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierStockReturnName" TEXT NOT NULL,
    "supplierStockReturnIsBackfill" BOOLEAN NOT NULL DEFAULT false,
    "purchaseReceiptName" TEXT NOT NULL,
    "purchaseReceiptIsBackfill" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnSpecialLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnSpecialLink_pair_key"
ON "GrnSpecialLink"("companyId", "supplierStockReturnName", "supplierStockReturnIsBackfill", "purchaseReceiptName", "purchaseReceiptIsBackfill");

CREATE INDEX "GrnSpecialLink_ssr_lookup_idx"
ON "GrnSpecialLink"("companyId", "supplierStockReturnName", "supplierStockReturnIsBackfill");

CREATE INDEX "GrnSpecialLink_pr_lookup_idx"
ON "GrnSpecialLink"("companyId", "purchaseReceiptName", "purchaseReceiptIsBackfill");
