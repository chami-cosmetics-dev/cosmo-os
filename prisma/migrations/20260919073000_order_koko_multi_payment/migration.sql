-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "kokoExtraLinkGeneratedAt" TIMESTAMP(3)[],
ADD COLUMN     "kokoMultiPaymentCount" INTEGER,
ADD COLUMN     "kokoMultiPaymentFlagged" BOOLEAN NOT NULL DEFAULT false;
