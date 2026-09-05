-- CreateTable
CREATE TABLE "MarketCompetitor" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteDomain" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketCompetitorLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "productUrl" TEXT NOT NULL,
    "competitorTitle" TEXT NOT NULL,
    "listedPriceLkr" DECIMAL(12,2) NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "checkDate" DATE NOT NULL,
    "notes" TEXT,
    "packSizeNormalized" TEXT,
    "sizeMismatchConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCompetitorLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketCompetitorPriceHistory" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "listedPriceLkr" DECIMAL(12,2) NOT NULL,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "checkDate" DATE NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketCompetitorPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketCompetitor_slug_key" ON "MarketCompetitor"("slug");

-- CreateIndex
CREATE INDEX "MarketCompetitorLink_companyId_sku_idx" ON "MarketCompetitorLink"("companyId", "sku");

-- CreateIndex
CREATE INDEX "MarketCompetitorLink_companyId_checkDate_idx" ON "MarketCompetitorLink"("companyId", "checkDate");

-- CreateIndex
CREATE UNIQUE INDEX "MarketCompetitorLink_companyId_sku_competitorId_key" ON "MarketCompetitorLink"("companyId", "sku", "competitorId");

-- CreateIndex
CREATE INDEX "MarketCompetitorPriceHistory_linkId_createdAt_idx" ON "MarketCompetitorPriceHistory"("linkId", "createdAt");

-- AddForeignKey
ALTER TABLE "MarketCompetitorLink" ADD CONSTRAINT "MarketCompetitorLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketCompetitorLink" ADD CONSTRAINT "MarketCompetitorLink_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "MarketCompetitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketCompetitorLink" ADD CONSTRAINT "MarketCompetitorLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketCompetitorLink" ADD CONSTRAINT "MarketCompetitorLink_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketCompetitorPriceHistory" ADD CONSTRAINT "MarketCompetitorPriceHistory_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "MarketCompetitorLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketCompetitorPriceHistory" ADD CONSTRAINT "MarketCompetitorPriceHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed six competitors
INSERT INTO "MarketCompetitor" ("id", "slug", "name", "websiteDomain", "sortOrder", "active", "createdAt", "updatedAt")
VALUES
  ('comp_angels_beauty', 'angels-beauty', 'Angels Beauty', 'angelsbeauty.lk', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('comp_essentials', 'essentials', 'Essentials', 'essentials.lk', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('comp_liberty_store', 'liberty-store', 'Liberty Store', 'libertystore.lk', 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('comp_kiki_beauty', 'kiki-beauty', 'Kiki Beauty', 'kikibeauty.lk', 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('comp_dreams_of_ceylonese', 'dreams-of-ceylonese', 'Dreams of Ceylonese', 'dreamsofceylonese.com', 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('comp_watsans', 'watsans', 'Watsans', 'watsans.lk', 6, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "websiteDomain" = EXCLUDED."websiteDomain",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

