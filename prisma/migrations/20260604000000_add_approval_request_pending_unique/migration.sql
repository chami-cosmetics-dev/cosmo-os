-- Remove duplicate pending order payment approvals, keeping the oldest per (orderId, type)
DELETE FROM "ApprovalRequest"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "orderId", "type" ORDER BY "createdAt" ASC) AS rn
    FROM "ApprovalRequest"
    WHERE status = 'pending' AND "orderId" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Remove duplicate pending return rearrange approvals, keeping the oldest per (orderReturnId, type)
DELETE FROM "ApprovalRequest"
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "orderReturnId", "type" ORDER BY "createdAt" ASC) AS rn
    FROM "ApprovalRequest"
    WHERE status = 'pending' AND "orderReturnId" IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- Prevent concurrent inserts from creating duplicate pending approvals for the same order
CREATE UNIQUE INDEX "ApprovalRequest_orderId_type_pending_unique"
ON "ApprovalRequest"("orderId", "type")
WHERE status = 'pending' AND "orderId" IS NOT NULL;

-- Prevent concurrent inserts from creating duplicate pending approvals for the same return
CREATE UNIQUE INDEX "ApprovalRequest_orderReturnId_type_pending_unique"
ON "ApprovalRequest"("orderReturnId", "type")
WHERE status = 'pending' AND "orderReturnId" IS NOT NULL;
