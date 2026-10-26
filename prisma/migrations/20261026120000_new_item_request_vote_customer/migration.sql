ALTER TABLE "NewItemRequestVote" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "NewItemRequestVote" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "NewItemRequestVote" ADD COLUMN IF NOT EXISTS "customerEmail" TEXT;

UPDATE "NewItemRequestVote" AS v
SET
  "customerName" = r."customerName",
  "customerPhone" = r."customerPhone"
FROM "NewItemRequest" AS r
WHERE v."requestId" = r."id"
  AND v."userId" = r."createdByUserId"
  AND v."customerName" IS NULL
  AND v."customerPhone" IS NULL;
