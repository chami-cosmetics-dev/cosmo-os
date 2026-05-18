-- CreateTable
CREATE TABLE "DashboardBrandConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardBrandConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardBrandConfig_companyId_name_key" ON "DashboardBrandConfig"("companyId", "name");

-- CreateIndex
CREATE INDEX "DashboardBrandConfig_companyId_sortOrder_idx" ON "DashboardBrandConfig"("companyId", "sortOrder");

-- AddForeignKey
ALTER TABLE "DashboardBrandConfig" ADD CONSTRAINT "DashboardBrandConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
