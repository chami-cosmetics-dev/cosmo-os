ALTER TABLE "Order" ADD COLUMN "sampleFreeIssueSendLaterDate" TIMESTAMP(3);

CREATE INDEX "Order_companyId_fulfillmentStage_sampleFreeIssueSendLaterDate_idx"
ON "Order"("companyId", "fulfillmentStage", "sampleFreeIssueSendLaterDate");
