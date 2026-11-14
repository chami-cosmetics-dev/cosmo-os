-- CreateTable
CREATE TABLE "StockHealthExcludedSku" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHealthExcludedSku_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockHealthExcludedSku_companyId_sku_key" ON "StockHealthExcludedSku"("companyId", "sku");

-- AddForeignKey
ALTER TABLE "StockHealthExcludedSku" ADD CONSTRAINT "StockHealthExcludedSku_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: the exclusion list that was hard-coded in lib/stock-health/config.ts, for every
-- company with an ERP connection.
INSERT INTO "StockHealthExcludedSku" ("id", "companyId", "sku")
SELECT md5(c."id" || v.sku), c."id", v.sku
FROM "Company" c
CROSS JOIN (VALUES
    ('NGV1000'), ('SGV1000'), ('SGV20000'), ('SGV5000'), ('TEST1'), ('TEST-1'),
    ('TEST-BC-UPD-01'), ('TEST-FAKE'), ('TEST-PRICE-CRT-01'),
    ('TMP-SSRTEST-86080150-ITEM'), ('TMP-SSRTEST-86080220-ITEM'), ('TMP-SSRTEST-86080277-ITEM'),
    ('TMP-SSRTEST-86080541-ITEM'), ('TMP-SSRTEST-86080618-ITEM'), ('TMP-SSRTEST-86080984-ITEM'),
    ('TMP-SSRTEST-86081060-ITEM'), ('TMP-SSRTEST-86092303-ITEM'), ('TMP-SSRTEST-86104510-ITEM'),
    ('TMP-SSRTEST-86104608-ITEM'), ('_PROBE_LOR24'), ('TEST'), ('TEST-123'),
    ('TEST-CAT-LK1-ERP01'), ('TEST-CAT-LK1-ERP02'), ('TEST-CAT-LK1-ERP03'), ('TEST-CAT-LK1-SHP01'),
    ('TMP-OPEN-20260810111742'), ('TEST-CAT-RESILIENCE-01')
) AS v(sku)
WHERE EXISTS (SELECT 1 FROM "ErpnextInstance" e WHERE e."companyId" = c."id");
