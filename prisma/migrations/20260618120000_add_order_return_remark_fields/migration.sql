-- AlterTable
ALTER TABLE "OrderReturn" ADD COLUMN "returnRemark" TEXT;
ALTER TABLE "OrderReturn" ADD COLUMN "remarkTemplate" TEXT;
ALTER TABLE "OrderReturn" ADD COLUMN "cancelRemark" TEXT;
ALTER TABLE "OrderReturn" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);

-- Backfill returnRemark from actionRemark where missing
UPDATE "OrderReturn" SET "returnRemark" = "actionRemark" WHERE "returnRemark" IS NULL AND "actionRemark" IS NOT NULL;
