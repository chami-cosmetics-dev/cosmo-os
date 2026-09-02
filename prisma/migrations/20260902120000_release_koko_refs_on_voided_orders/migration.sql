-- Release KOKO references held by voided/cancelled orders so finance can reuse them.
DELETE FROM "ApprovalKokoReference" akr
USING "ApprovalRequest" ar
INNER JOIN "Order" o ON o."id" = ar."orderId"
WHERE akr."approvalRequestId" = ar."id"
  AND lower(trim(coalesce(o."financialStatus", ''))) = 'voided';

UPDATE "ApprovalRequest" ar
SET "kokoReference" = NULL
FROM "Order" o
WHERE ar."orderId" = o."id"
  AND lower(trim(coalesce(o."financialStatus", ''))) = 'voided'
  AND ar."kokoReference" IS NOT NULL;
