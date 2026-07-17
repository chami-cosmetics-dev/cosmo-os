-- CreateTable
CREATE TABLE "ProductOsfProfile" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "shopAvailability" TEXT,
    "ogfPrice" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOsfProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOsfRop" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "columnKey" TEXT NOT NULL,
    "ropQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOsfRop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OsfColumnConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "companyLocationId" TEXT,
    "includeInStock" BOOLEAN NOT NULL DEFAULT true,
    "includeInRop" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OsfColumnConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductOsfProfile_companyId_idx" ON "ProductOsfProfile"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOsfProfile_companyId_sku_key" ON "ProductOsfProfile"("companyId", "sku");

-- CreateIndex
CREATE INDEX "ProductOsfRop_companyId_sku_idx" ON "ProductOsfRop"("companyId", "sku");

-- CreateIndex
CREATE INDEX "ProductOsfRop_companyId_columnKey_idx" ON "ProductOsfRop"("companyId", "columnKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductOsfRop_companyId_sku_columnKey_key" ON "ProductOsfRop"("companyId", "sku", "columnKey");

-- CreateIndex
CREATE INDEX "OsfColumnConfig_companyId_sortOrder_idx" ON "OsfColumnConfig"("companyId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "OsfColumnConfig_companyId_key_key" ON "OsfColumnConfig"("companyId", "key");

-- AddForeignKey
ALTER TABLE "ProductOsfProfile" ADD CONSTRAINT "ProductOsfProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOsfRop" ADD CONSTRAINT "ProductOsfRop_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsfColumnConfig" ADD CONSTRAINT "OsfColumnConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsfColumnConfig" ADD CONSTRAINT "OsfColumnConfig_companyLocationId_fkey" FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
