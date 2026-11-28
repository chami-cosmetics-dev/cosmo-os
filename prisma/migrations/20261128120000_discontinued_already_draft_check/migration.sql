-- AlterTable: when Shopify was read (once, after approval) to see if the product was already Draft
ALTER TABLE "DiscontinuedItem" ADD COLUMN "alreadyDraftCheckedAt" TIMESTAMP(3);
