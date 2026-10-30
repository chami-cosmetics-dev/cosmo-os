-- CreateTable
CREATE TABLE "SalesBudgetFile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "targetMonth" TEXT NOT NULL,
    "blobUrl" TEXT NOT NULL,
    "blobPathname" TEXT NOT NULL,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSavedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesBudgetFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesBudgetFile_companyId_targetMonth_key" ON "SalesBudgetFile"("companyId", "targetMonth");

-- AddForeignKey
ALTER TABLE "SalesBudgetFile" ADD CONSTRAINT "SalesBudgetFile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesBudgetFile" ADD CONSTRAINT "SalesBudgetFile_lastSavedById_fkey" FOREIGN KEY ("lastSavedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
