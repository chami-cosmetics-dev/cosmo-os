ALTER TABLE "MerchantOrderReview"
  ADD COLUMN "callMade" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "callbackDate" TIMESTAMP(3),
  ADD COLUMN "customerResponseStatus" TEXT,
  ADD COLUMN "reviewerFirstName" TEXT,
  ADD COLUMN "reviewerLastName" TEXT,
  ADD COLUMN "reviewerEmail" TEXT,
  ADD COLUMN "reason" TEXT;
