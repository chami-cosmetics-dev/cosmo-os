-- Add columnKeys, migrate legacy columnGroups → static header keys, then drop columnGroups.
ALTER TABLE "OsfUserColumnAccess" ADD COLUMN "columnKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "OsfUserColumnAccess" AS o
SET "columnKeys" = sub.keys
FROM (
  SELECT
    id,
    (
      SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::TEXT[])
      FROM (
        SELECT unnest(
          (CASE WHEN 'pricing' = ANY("columnGroups")
            THEN ARRAY['Cosmetics MRP','Discounted Price','OGF Price']::TEXT[]
            ELSE ARRAY[]::TEXT[] END)
          ||
          (CASE WHEN 'cost' = ANY("columnGroups")
            THEN ARRAY[
              'Latest Cost','Latest supplier','Last Purchase Qty','Last Purchase Date',
              'Days Since Last Purchase','Purchased (last 30d)'
            ]::TEXT[]
            ELSE ARRAY[]::TEXT[] END)
          ||
          (CASE WHEN 'margins' = ANY("columnGroups")
            THEN ARRAY['Cosmetics Margin %','OGF Margin %']::TEXT[]
            ELSE ARRAY[]::TEXT[] END)
          ||
          (CASE WHEN 'sales' = ANY("columnGroups")
            THEN ARRAY['Sales Units']::TEXT[]
            ELSE ARRAY[]::TEXT[] END)
        ) AS x
      ) u
      WHERE x IS NOT NULL AND x <> ''
    ) AS keys
  FROM "OsfUserColumnAccess"
) AS sub
WHERE o.id = sub.id;

ALTER TABLE "OsfUserColumnAccess" DROP COLUMN "columnGroups";
