-- CreateTable
CREATE TABLE "CompanyLocationWarehouse" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyLocationId" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyLocationWarehouse_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CompanyLocationWarehouse" ADD CONSTRAINT "CompanyLocationWarehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyLocationWarehouse" ADD CONSTRAINT "CompanyLocationWarehouse_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "CompanyLocationWarehouse_companyLocationId_warehouse_key" ON "CompanyLocationWarehouse"("companyLocationId", "warehouse");

-- CreateIndex
CREATE INDEX "CompanyLocationWarehouse_companyId_companyLocationId_idx" ON "CompanyLocationWarehouse"("companyId", "companyLocationId");
