-- CreateEnum
CREATE TYPE "DiscontinuedItemStage" AS ENUM ('AWAITING_APPROVAL', 'PENDING', 'SHOPIFY_DRAFT', 'DONE');

-- AlterTable
ALTER TABLE "DiscontinuedItem"
  ADD COLUMN "erp1DryRun" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "erp2DryRun" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stage" "DiscontinuedItemStage" NOT NULL DEFAULT 'AWAITING_APPROVAL',
  ADD COLUMN "approvedDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "DiscontinuedItem_stage_idx" ON "DiscontinuedItem"("stage");
