-- Permanent per-company counter for gift voucher group numbers.
CREATE TABLE "GiftVoucherCounter" (
  "companyId" TEXT NOT NULL,
  "lastGroupNumber" INTEGER NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GiftVoucherCounter_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "GiftVoucherCounter"
  ADD CONSTRAINT "GiftVoucherCounter_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Number any groups created before this migration from 141 in creation order.
ALTER TABLE "GiftVoucherGroup" ADD COLUMN "groupNumber" INTEGER;

UPDATE "GiftVoucherGroup" g
SET "groupNumber" = numbered.n
FROM (
  SELECT "id", 140 + ROW_NUMBER() OVER (PARTITION BY "companyId" ORDER BY "createdAt", "id") AS n
  FROM "GiftVoucherGroup"
) numbered
WHERE g."id" = numbered."id";

ALTER TABLE "GiftVoucherGroup" ALTER COLUMN "groupNumber" SET NOT NULL;

CREATE UNIQUE INDEX "GiftVoucherGroup_companyId_groupNumber_key" ON "GiftVoucherGroup"("companyId", "groupNumber");

INSERT INTO "GiftVoucherCounter" ("companyId", "lastGroupNumber", "updatedAt")
SELECT "companyId", MAX("groupNumber"), CURRENT_TIMESTAMP
FROM "GiftVoucherGroup"
GROUP BY "companyId";

-- Codes are permanent: deleting a group must not delete its codes.
ALTER TABLE "GiftVoucherCode" DROP CONSTRAINT "GiftVoucherCode_groupId_fkey";

ALTER TABLE "GiftVoucherCode"
  ADD CONSTRAINT "GiftVoucherCode_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "GiftVoucherGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
