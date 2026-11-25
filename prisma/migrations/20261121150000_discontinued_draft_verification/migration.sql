-- CreateEnum
CREATE TYPE "DiscontinuedDraftCheckResult" AS ENUM ('AWAITING', 'PASS', 'FAIL', 'CHECK_FAILED');

-- AlterTable
ALTER TABLE "DiscontinuedItem" ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DiscontinuedItemDraftAttempt" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL,
    "clickedBy" TEXT NOT NULL,
    "result" "DiscontinuedDraftCheckResult" NOT NULL DEFAULT 'AWAITING',
    "shopifyStatus" TEXT,
    "handle" TEXT,
    "checkedAt" TIMESTAMP(3),
    "checkCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "checkFailedNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscontinuedItemDraftAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiscontinuedItemDraftAttempt_result_clickedAt_idx" ON "DiscontinuedItemDraftAttempt"("result", "clickedAt");

-- CreateIndex
CREATE INDEX "DiscontinuedItemDraftAttempt_itemId_clickedAt_idx" ON "DiscontinuedItemDraftAttempt"("itemId", "clickedAt");

-- AddForeignKey
ALTER TABLE "DiscontinuedItemDraftAttempt" ADD CONSTRAINT "DiscontinuedItemDraftAttempt_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DiscontinuedItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
