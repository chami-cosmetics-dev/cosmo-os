CREATE TABLE "StoreAllocationExcessStock" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreAllocationExcessStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StoreAllocationExcessStock_companyId_sku_key" ON "StoreAllocationExcessStock"("companyId", "sku");
CREATE INDEX "StoreAllocationExcessStock_companyId_idx" ON "StoreAllocationExcessStock"("companyId");
ALTER TABLE "StoreAllocationExcessStock" ADD CONSTRAINT "StoreAllocationExcessStock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
