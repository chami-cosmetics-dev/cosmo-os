-- CreateTable
CREATE TABLE "ErpStockSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "sku" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ErpStockSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ErpStockSnapshot_companyId_snapshotDate_sku_warehouse_key" ON "ErpStockSnapshot"("companyId", "snapshotDate", "sku", "warehouse");

-- CreateIndex
CREATE INDEX "ErpStockSnapshot_companyId_snapshotDate_idx" ON "ErpStockSnapshot"("companyId", "snapshotDate");

-- CreateIndex
CREATE INDEX "ErpStockSnapshot_companyId_sku_snapshotDate_idx" ON "ErpStockSnapshot"("companyId", "sku", "snapshotDate");

-- AddForeignKey
ALTER TABLE "ErpStockSnapshot" ADD CONSTRAINT "ErpStockSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
