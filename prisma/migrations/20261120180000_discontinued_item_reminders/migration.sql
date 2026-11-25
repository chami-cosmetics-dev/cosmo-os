-- AlterTable
ALTER TABLE "DiscontinuedItem" ADD COLUMN "seoNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DiscontinuedItemReminderState" (
    "key" TEXT NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL,
    "lastCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscontinuedItemReminderState_pkey" PRIMARY KEY ("key")
);
