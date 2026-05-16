ALTER TABLE "ProductItem"
ADD COLUMN "itemStatusCategory" TEXT NOT NULL DEFAULT 'UNCATEGORIZED',
ADD COLUMN "itemStatusLabel" TEXT;

CREATE INDEX "ProductItem_companyId_itemStatusCategory_idx" ON "ProductItem"("companyId", "itemStatusCategory");
