-- AlterTable
ALTER TABLE "Order" ADD COLUMN "district" TEXT;

-- CreateIndex
CREATE INDEX "Order_companyId_district_idx" ON "Order"("companyId", "district");
