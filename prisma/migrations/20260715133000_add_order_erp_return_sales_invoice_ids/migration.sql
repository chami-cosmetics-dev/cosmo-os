-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpReturnSalesInvoiceIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
