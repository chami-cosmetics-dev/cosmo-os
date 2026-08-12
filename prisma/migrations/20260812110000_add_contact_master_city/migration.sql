-- AlterTable
ALTER TABLE "ContactMaster" ADD COLUMN "city" TEXT;

-- CreateIndex
CREATE INDEX "ContactMaster_companyId_city_idx" ON "ContactMaster"("companyId", "city");

-- Backfill city from the last comma/slash segment of address.
UPDATE "ContactMaster"
SET "city" = NULLIF(
  TRIM(BOTH FROM regexp_replace(
    regexp_replace(
      split_part(
        regexp_replace("address", '[/|]', ',', 'g'),
        ',',
        GREATEST(
          1,
          COALESCE(
            ARRAY_LENGTH(
              STRING_TO_ARRAY(regexp_replace("address", '[/|]', ',', 'g'), ','),
              1
            ),
            1
          )
        )
      ),
      '\s*\d{4,5}\s*',
      ' ',
      'g'
    ),
    '\s+',
    ' ',
    'g'
  )),
  ''
)
WHERE "city" IS NULL
  AND "address" IS NOT NULL
  AND btrim("address") <> '';

UPDATE "ContactMaster"
SET "city" = 'Colombo'
WHERE "city" ~* '^colombo\s*\d{1,2}$';

UPDATE "ContactMaster"
SET "city" = NULL
WHERE "city" IS NOT NULL
  AND lower("city") IN (
    'sri lanka',
    'western',
    'southern',
    'central',
    'eastern',
    'northern',
    'uva',
    'sabaragamuwa',
    'province',
    'district'
  );
