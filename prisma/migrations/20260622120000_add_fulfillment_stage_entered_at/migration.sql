-- AlterTable
ALTER TABLE "Order" ADD COLUMN "fulfillmentStageEnteredAt" TIMESTAMP(3);

-- Backfill per current fulfillment stage
UPDATE "Order" o
SET "fulfillmentStageEnteredAt" = CASE
  WHEN o."fulfillmentStage" IN ('order_received', 'sample_free_issue') THEN o."createdAt"
  WHEN o."fulfillmentStage" = 'print' THEN COALESCE(o."sampleFreeIssueCompleteAt", o."createdAt")
  WHEN o."fulfillmentStage" = 'ready_to_dispatch' THEN COALESCE(o."packageReadyAt", o."updatedAt")
  WHEN o."fulfillmentStage" = 'dispatched' THEN COALESCE(o."dispatchedAt", o."updatedAt")
  WHEN o."fulfillmentStage" = 'delivery_complete' THEN COALESCE(o."deliveryCompleteAt", o."updatedAt")
  WHEN o."fulfillmentStage" = 'invoice_complete' THEN COALESCE(o."invoiceCompleteAt", o."updatedAt")
  WHEN o."fulfillmentStage" = 'returned_to_store' THEN COALESCE(
    (SELECT MAX(r."returnDate") FROM "OrderReturn" r WHERE r."orderId" = o."id"),
    o."updatedAt"
  )
  ELSE o."createdAt"
END
WHERE o."fulfillmentStageEnteredAt" IS NULL;
