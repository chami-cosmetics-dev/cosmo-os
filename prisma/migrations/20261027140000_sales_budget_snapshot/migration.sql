-- Sales Budget saves become a DB snapshot (JSON), like the report snapshots; the Excel is
-- built from it on download. SalesBudgetFile (Blob file pointer) was empty on every DB.
DROP TABLE "SalesBudgetFile";

-- CreateTable
CREATE TABLE "SalesBudgetSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "targetMonth" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSavedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesBudgetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesBudgetSnapshot_companyId_targetMonth_key" ON "SalesBudgetSnapshot"("companyId", "targetMonth");

-- AddForeignKey
ALTER TABLE "SalesBudgetSnapshot" ADD CONSTRAINT "SalesBudgetSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesBudgetSnapshot" ADD CONSTRAINT "SalesBudgetSnapshot_lastSavedById_fkey" FOREIGN KEY ("lastSavedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
