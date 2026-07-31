-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "erpnextCustomerId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Order_companyId_erpnextCustomerId_idx" ON "Order"("companyId", "erpnextCustomerId");
