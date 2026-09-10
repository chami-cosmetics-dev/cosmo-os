ALTER TABLE "StoreStockCountReport" ADD COLUMN "combinedAt" TIMESTAMP(3);

CREATE TABLE "StoreStockCountItemLane" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreStockCountItemLane_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreStockCountItemLane_itemId_userId_key" ON "StoreStockCountItemLane"("itemId", "userId");
CREATE INDEX "StoreStockCountItemLane_reportId_userId_idx" ON "StoreStockCountItemLane"("reportId", "userId");
CREATE INDEX "StoreStockCountItemLane_companyId_idx" ON "StoreStockCountItemLane"("companyId");

ALTER TABLE "StoreStockCountItemLane" ADD CONSTRAINT "StoreStockCountItemLane_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreStockCountItemLane" ADD CONSTRAINT "StoreStockCountItemLane_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "StoreStockCountReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreStockCountItemLane" ADD CONSTRAINT "StoreStockCountItemLane_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "StoreStockCountReportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreStockCountItemLane" ADD CONSTRAINT "StoreStockCountItemLane_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StoreStockCountUserSave" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreStockCountUserSave_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreStockCountUserSave_reportId_userId_key" ON "StoreStockCountUserSave"("reportId", "userId");
CREATE INDEX "StoreStockCountUserSave_companyId_idx" ON "StoreStockCountUserSave"("companyId");

ALTER TABLE "StoreStockCountUserSave" ADD CONSTRAINT "StoreStockCountUserSave_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreStockCountUserSave" ADD CONSTRAINT "StoreStockCountUserSave_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "StoreStockCountReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreStockCountUserSave" ADD CONSTRAINT "StoreStockCountUserSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "StoreStockCountItemLane" ("id", "companyId", "reportId", "itemId", "userId", "quantity", "createdAt", "updatedAt")
SELECT
    CONCAT('lane_', i."id"),
    i."companyId",
    i."reportId",
    i."id",
    r."createdByUserId",
    i."manualCount",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "StoreStockCountReportItem" i
INNER JOIN "StoreStockCountReport" r ON r."id" = i."reportId"
WHERE i."manualCount" IS NOT NULL
  AND r."createdByUserId" IS NOT NULL;
