-- CreateTable
CREATE TABLE "StockHealthSkuSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "commonSku" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "itemName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHealthSkuSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockHealthSkuSnapshot_companyId_snapshotDate_commonSku_key" ON "StockHealthSkuSnapshot"("companyId", "snapshotDate", "commonSku");

-- CreateIndex
CREATE INDEX "StockHealthSkuSnapshot_companyId_snapshotDate_idx" ON "StockHealthSkuSnapshot"("companyId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "StockHealthSkuSnapshot" ADD CONSTRAINT "StockHealthSkuSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
