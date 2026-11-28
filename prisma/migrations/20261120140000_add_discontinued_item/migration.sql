-- CreateEnum
CREATE TYPE "DiscontinuedItemPresence" AS ENUM ('BOTH', 'ERP1_ONLY', 'ERP2_ONLY');

-- CreateEnum
CREATE TYPE "DiscontinuedItemVerification" AS ENUM ('PASS', 'FAIL');

-- CreateTable
CREATE TABLE "DiscontinuedItem" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "productTitle" TEXT,
    "priorityStatus" TEXT,
    "maxSaleQty" INTEGER,
    "impressions" INTEGER,
    "clicks" INTEGER,
    "ctr" DECIMAL(7,4),
    "avgPosition" DECIMAL(8,2),
    "presentIn" "DiscontinuedItemPresence",
    "erp1DisabledDate" TIMESTAMP(3),
    "erp1DisabledBy" TEXT,
    "erp2DisabledDate" TIMESTAMP(3),
    "erp2DisabledBy" TEXT,
    "disableReason" TEXT,
    "redirectionLink" TEXT,
    "draftClickedDate" TIMESTAMP(3),
    "draftClickedBy" TEXT,
    "verification" "DiscontinuedItemVerification",
    "doneDate" TIMESTAMP(3),
    "madeActiveAgain" BOOLEAN NOT NULL DEFAULT false,
    "activeDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscontinuedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscontinuedItem_sku_key" ON "DiscontinuedItem"("sku");

-- CreateIndex
CREATE INDEX "DiscontinuedItem_presentIn_idx" ON "DiscontinuedItem"("presentIn");

-- CreateIndex
CREATE INDEX "DiscontinuedItem_doneDate_idx" ON "DiscontinuedItem"("doneDate");

-- CreateIndex
CREATE INDEX "DiscontinuedItem_createdAt_idx" ON "DiscontinuedItem"("createdAt");
