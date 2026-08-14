-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "replacedByOrderId" TEXT;

-- CreateIndex
CREATE INDEX "Order_companyId_replacedByOrderId_idx" ON "Order"("companyId", "replacedByOrderId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_replacedByOrderId_fkey" FOREIGN KEY ("replacedByOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
