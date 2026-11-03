-- The initial legacy Material Issue tables are empty. A Material Issue can be
-- linked to several SSRs, so normalize the document and its items once, then
-- attach SSRs through a dedicated link table.
DROP TABLE "GrnSupplierStockReturnMaterialIssueItem";
DROP TABLE "GrnSupplierStockReturnMaterialIssue";

CREATE TABLE "GrnMaterialIssue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "erpCompany" TEXT,
    "purpose" TEXT,
    "stockEntryType" TEXT,
    "docstatus" INTEGER,
    "postingDate" TIMESTAMP(3),
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnMaterialIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnMaterialIssueItem" (
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

    CONSTRAINT "GrnMaterialIssueItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnSupplierStockReturnMaterialIssueLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierStockReturnName" TEXT NOT NULL,
    "supplierStockReturnIsBackfill" BOOLEAN NOT NULL DEFAULT false,
    "materialIssueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnSsrMaterialIssueLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnMaterialIssue_company_name_key" ON "GrnMaterialIssue"("companyId", "name");
CREATE UNIQUE INDEX "GrnMaterialIssueItem_parent_name_key" ON "GrnMaterialIssueItem"("materialIssueId", "name");
CREATE INDEX "GrnMaterialIssueItem_item_lookup_idx" ON "GrnMaterialIssueItem"("companyId", "itemCode");
CREATE UNIQUE INDEX "GrnSsrMaterialIssueLink_ssr_key"
ON "GrnSupplierStockReturnMaterialIssueLink"("companyId", "supplierStockReturnName", "supplierStockReturnIsBackfill");
CREATE INDEX "GrnSsrMaterialIssueLink_issue_lookup_idx"
ON "GrnSupplierStockReturnMaterialIssueLink"("companyId", "materialIssueId");

ALTER TABLE "GrnMaterialIssueItem"
ADD CONSTRAINT "GrnMaterialIssueItem_parent_fkey"
FOREIGN KEY ("materialIssueId") REFERENCES "GrnMaterialIssue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrnSupplierStockReturnMaterialIssueLink"
ADD CONSTRAINT "GrnSsrMaterialIssueLink_issue_fkey"
FOREIGN KEY ("materialIssueId") REFERENCES "GrnMaterialIssue"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
