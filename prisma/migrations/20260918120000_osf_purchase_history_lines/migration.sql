-- CreateTable
CREATE TABLE "OsfPurchaseHistoryLine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "postingDate" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "netValue" DOUBLE PRECISION NOT NULL,
    "excelCompany" TEXT,
    "sourceRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OsfPurchaseHistoryLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OsfPurchaseHistoryLine_companyId_sku_idx" ON "OsfPurchaseHistoryLine"("companyId", "sku");

-- CreateIndex
CREATE INDEX "OsfPurchaseHistoryLine_companyId_postingDate_idx" ON "OsfPurchaseHistoryLine"("companyId", "postingDate");

-- CreateIndex
CREATE INDEX "OsfPurchaseHistoryLine_companyId_sku_postingDate_idx" ON "OsfPurchaseHistoryLine"("companyId", "sku", "postingDate");

-- AddForeignKey
ALTER TABLE "OsfPurchaseHistoryLine" ADD CONSTRAINT "OsfPurchaseHistoryLine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
