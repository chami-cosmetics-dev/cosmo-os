-- AlterTable
ALTER TABLE "DiscontinuedItem" ADD COLUMN "activeAgainNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DiscontinuedItemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscontinuedItemSetting_pkey" PRIMARY KEY ("key")
);
