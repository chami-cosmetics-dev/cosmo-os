-- Never-contacted contacts stay marked N/A. Real outcomes are left as stored.
UPDATE "ContactMaster"
SET "category" = 'N/A'
WHERE "category" IS NULL OR btrim("category") = '';

ALTER TABLE "ContactMaster" ALTER COLUMN "category" SET DEFAULT 'N/A';
