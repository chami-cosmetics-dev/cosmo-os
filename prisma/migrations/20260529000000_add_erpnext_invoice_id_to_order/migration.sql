ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpnextInvoiceId" TEXT;
CREATE INDEX IF NOT EXISTS "Order_erpnextInvoiceId_idx" ON "Order"("erpnextInvoiceId");
