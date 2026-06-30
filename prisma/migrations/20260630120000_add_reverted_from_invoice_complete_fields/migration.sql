-- AlterTable: track when/who finance user reverted an order from invoice_complete
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "revertedFromInvoiceCompleteAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "revertedFromInvoiceCompleteById" TEXT;
