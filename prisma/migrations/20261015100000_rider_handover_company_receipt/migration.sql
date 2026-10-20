-- AlterTable
ALTER TABLE "RiderFinanceCashReceipt" ADD COLUMN "handoverCompany" TEXT;

-- CreateIndex
CREATE INDEX "RiderFinanceCashReceipt_companyId_riderId_handoverCompany_idx" ON "RiderFinanceCashReceipt"("companyId", "riderId", "handoverCompany");
