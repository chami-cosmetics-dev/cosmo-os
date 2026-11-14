-- CreateTable
CREATE TABLE "StockHealthWeeklySnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "snapshotDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHealthWeeklySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockHealthWeeklySnapshot_companyId_snapshotDate_status_key" ON "StockHealthWeeklySnapshot"("companyId", "snapshotDate", "status");

-- CreateIndex
CREATE INDEX "StockHealthWeeklySnapshot_companyId_snapshotDate_idx" ON "StockHealthWeeklySnapshot"("companyId", "snapshotDate");

-- AddForeignKey
ALTER TABLE "StockHealthWeeklySnapshot" ADD CONSTRAINT "StockHealthWeeklySnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
