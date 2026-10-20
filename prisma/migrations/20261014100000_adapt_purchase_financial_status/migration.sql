-- Supplement contact import stores voided/refunded so sale totals can skip them.
ALTER TABLE "AdaptPurchaseHistory" ADD COLUMN "financialStatus" TEXT;
