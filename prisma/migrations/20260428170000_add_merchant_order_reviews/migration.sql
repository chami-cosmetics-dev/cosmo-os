CREATE TABLE "MerchantOrderReview" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "merchantUserId" TEXT,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "customerRating" INTEGER,
    "customerFeedback" TEXT,
    "itemFeedback" TEXT,
    "merchantNotes" TEXT,
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "reviewMarkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantOrderReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchantOrderReview_orderId_key" ON "MerchantOrderReview"("orderId");
CREATE INDEX "MerchantOrderReview_companyId_reviewStatus_updatedAt_idx" ON "MerchantOrderReview"("companyId", "reviewStatus", "updatedAt" DESC);
CREATE INDEX "MerchantOrderReview_companyId_merchantUserId_reviewStatus_up_idx" ON "MerchantOrderReview"("companyId", "merchantUserId", "reviewStatus", "updatedAt" DESC);

ALTER TABLE "MerchantOrderReview"
ADD CONSTRAINT "MerchantOrderReview_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchantOrderReview"
ADD CONSTRAINT "MerchantOrderReview_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MerchantOrderReview"
ADD CONSTRAINT "MerchantOrderReview_merchantUserId_fkey"
FOREIGN KEY ("merchantUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
