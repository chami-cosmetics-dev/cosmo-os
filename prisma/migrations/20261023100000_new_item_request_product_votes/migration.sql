-- AlterTable
ALTER TABLE "NewItemRequest" ADD COLUMN IF NOT EXISTS "productName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NewItemRequest" ADD COLUMN IF NOT EXISTS "productNameNormalized" TEXT NOT NULL DEFAULT '';
ALTER TABLE "NewItemRequest" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "NewItemRequest" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;

UPDATE "NewItemRequest"
SET
  "productName" = CASE WHEN btrim("description") <> '' THEN left(btrim("description"), 255) ELSE 'Untitled item' END,
  "productNameNormalized" = lower(regexp_replace(
    btrim(CASE WHEN btrim("description") <> '' THEN left(btrim("description"), 255) ELSE 'Untitled item' END),
    '\s+',
    ' ',
    'g'
  ))
WHERE btrim("productName") = '';

CREATE INDEX IF NOT EXISTS "NewItemRequest_companyId_productNameNormalized_status_idx"
  ON "NewItemRequest"("companyId", "productNameNormalized", "status");

-- CreateTable
CREATE TABLE IF NOT EXISTS "NewItemRequestVote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewItemRequestVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "NewItemRequestVote_requestId_userId_key" ON "NewItemRequestVote"("requestId", "userId");
CREATE INDEX IF NOT EXISTS "NewItemRequestVote_companyId_requestId_idx" ON "NewItemRequestVote"("companyId", "requestId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NewItemRequestVote_companyId_fkey'
  ) THEN
    ALTER TABLE "NewItemRequestVote"
      ADD CONSTRAINT "NewItemRequestVote_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NewItemRequestVote_requestId_fkey'
  ) THEN
    ALTER TABLE "NewItemRequestVote"
      ADD CONSTRAINT "NewItemRequestVote_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "NewItemRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'NewItemRequestVote_userId_fkey'
  ) THEN
    ALTER TABLE "NewItemRequestVote"
      ADD CONSTRAINT "NewItemRequestVote_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "NewItemRequestVote" ("id", "companyId", "requestId", "userId", "createdAt")
SELECT gen_random_uuid()::text, r."companyId", r."id", r."createdByUserId", r."createdAt"
FROM "NewItemRequest" r
WHERE r."createdByUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "NewItemRequestVote" v
    WHERE v."requestId" = r."id" AND v."userId" = r."createdByUserId"
  );
