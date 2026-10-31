CREATE TABLE "GrnSupplierStockReturnMaterialIssue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierStockReturnName" TEXT NOT NULL,
    "supplierStockReturnIsBackfill" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "erpCompany" TEXT,
    "purpose" TEXT,
    "stockEntryType" TEXT,
    "docstatus" INTEGER,
    "postingDate" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnSupplierStockReturnMaterialIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnSupplierStockReturnMaterialIssueItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "materialIssueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT,
    "qty" DECIMAL(18,6) NOT NULL,
    "stockUom" TEXT,
    "basicRate" DECIMAL(18,6),
    "basicAmount" DECIMAL(18,6),
    "valuationRate" DECIMAL(18,6),
    "amount" DECIMAL(18,6),
    "effectiveRate" DECIMAL(18,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnSupplierStockReturnMaterialIssueItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnSsrMaterialIssue_ssr_key"
ON "GrnSupplierStockReturnMaterialIssue"("companyId", "supplierStockReturnName", "supplierStockReturnIsBackfill");

CREATE UNIQUE INDEX "GrnSsrMaterialIssue_name_key"
ON "GrnSupplierStockReturnMaterialIssue"("companyId", "name");

CREATE INDEX "GrnSsrMaterialIssue_ssr_lookup_idx"
ON "GrnSupplierStockReturnMaterialIssue"("companyId", "supplierStockReturnName", "supplierStockReturnIsBackfill");

CREATE UNIQUE INDEX "GrnSsrMaterialIssueItem_key"
ON "GrnSupplierStockReturnMaterialIssueItem"("materialIssueId", "name");

CREATE INDEX "GrnSsrMaterialIssueItem_item_lookup_idx"
ON "GrnSupplierStockReturnMaterialIssueItem"("companyId", "itemCode");

ALTER TABLE "GrnSupplierStockReturnMaterialIssueItem"
ADD CONSTRAINT "GrnSsrMaterialIssueItem_parent_fkey"
FOREIGN KEY ("materialIssueId") REFERENCES "GrnSupplierStockReturnMaterialIssue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
