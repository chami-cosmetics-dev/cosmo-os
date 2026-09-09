-- AlterTable
ALTER TABLE "OsfColumnConfig" ADD COLUMN "erpCompany" TEXT;

-- CreateTable
CREATE TABLE "OsfMonthlySalesHistory" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "columnKey" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OsfMonthlySalesHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OsfMonthlySalesHistory_companyId_sku_columnKey_month_key" ON "OsfMonthlySalesHistory"("companyId", "sku", "columnKey", "month");

-- CreateIndex
CREATE INDEX "OsfMonthlySalesHistory_companyId_month_idx" ON "OsfMonthlySalesHistory"("companyId", "month");

-- CreateIndex
CREATE INDEX "OsfMonthlySalesHistory_companyId_sku_idx" ON "OsfMonthlySalesHistory"("companyId", "sku");

-- AddForeignKey
ALTER TABLE "OsfMonthlySalesHistory" ADD CONSTRAINT "OsfMonthlySalesHistory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
