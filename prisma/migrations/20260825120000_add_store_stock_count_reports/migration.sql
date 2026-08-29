-- CreateTable
CREATE TABLE "StoreStockCountReport" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "selectedCompanies" JSONB NOT NULL,
    "warehouses" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "submittedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreStockCountReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreStockCountReportItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "skuKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "barcodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "stockByWarehouse" JSONB NOT NULL,
    "stockSum" INTEGER,
    "manualCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreStockCountReportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreStockCountReport_companyId_updatedAt_idx" ON "StoreStockCountReport"("companyId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "StoreStockCountReport_companyId_status_updatedAt_idx" ON "StoreStockCountReport"("companyId", "status", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StoreStockCountReportItem_reportId_skuKey_key" ON "StoreStockCountReportItem"("reportId", "skuKey");

-- CreateIndex
CREATE INDEX "StoreStockCountReportItem_companyId_skuKey_idx" ON "StoreStockCountReportItem"("companyId", "skuKey");

-- CreateIndex
CREATE INDEX "StoreStockCountReportItem_reportId_name_idx" ON "StoreStockCountReportItem"("reportId", "name");

-- CreateIndex
CREATE INDEX "StoreStockCountReportItem_reportId_manualCount_idx" ON "StoreStockCountReportItem"("reportId", "manualCount");

-- CreateIndex
CREATE INDEX "StoreStockCountReportItem_reportId_stockSum_idx" ON "StoreStockCountReportItem"("reportId", "stockSum");

-- AddForeignKey
ALTER TABLE "StoreStockCountReport" ADD CONSTRAINT "StoreStockCountReport_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreStockCountReport" ADD CONSTRAINT "StoreStockCountReport_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreStockCountReport" ADD CONSTRAINT "StoreStockCountReport_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreStockCountReport" ADD CONSTRAINT "StoreStockCountReport_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreStockCountReportItem" ADD CONSTRAINT "StoreStockCountReportItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreStockCountReportItem" ADD CONSTRAINT "StoreStockCountReportItem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "StoreStockCountReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
