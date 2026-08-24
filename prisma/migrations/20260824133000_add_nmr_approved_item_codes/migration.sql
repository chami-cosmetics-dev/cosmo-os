CREATE TABLE "NmrApprovedItemCode" (
  "id"        TEXT         NOT NULL,
  "companyId" TEXT         NOT NULL,
  "itemCode"  TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NmrApprovedItemCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NmrApprovedItemCode_companyId_itemCode_key"
  ON "NmrApprovedItemCode"("companyId", "itemCode");

CREATE INDEX "NmrApprovedItemCode_companyId_idx"
  ON "NmrApprovedItemCode"("companyId");

ALTER TABLE "NmrApprovedItemCode"
  ADD CONSTRAINT "NmrApprovedItemCode_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "NmrApprovedItemCode" ("id", "companyId", "itemCode")
SELECT
  'c' || substring(md5(company."id" || codes."itemCode") from 1 for 24),
  company."id",
  codes."itemCode"
FROM "Company" AS company
CROSS JOIN (
  VALUES
    ('CB004_1'),
    ('SS094_2'),
    ('CB024_1'),
    ('SS089_2'),
    ('CB005_2'),
    ('CB0055_1'),
    ('SS100_1'),
    ('CB043_1'),
    ('CB096_1'),
    ('CO039_1')
) AS codes("itemCode");
