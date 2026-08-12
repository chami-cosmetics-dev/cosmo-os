-- AlterTable
ALTER TABLE "ContactAllocationUpdate" ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "remark" TEXT;

-- AlterTable
ALTER TABLE "ContactMaster" ADD COLUMN     "loyaltyAssignedAt" TIMESTAMP(3),
ADD COLUMN     "loyaltyAssignedByUserId" TEXT,
ADD COLUMN     "loyaltyAssignedTier" TEXT,
ADD COLUMN     "loyaltyOutreachStatus" TEXT;

-- CreateIndex
CREATE INDEX "ContactMaster_companyId_loyaltyAssignedAt_idx" ON "ContactMaster"("companyId", "loyaltyAssignedAt");

-- CreateIndex
CREATE INDEX "ContactMaster_companyId_loyaltyOutreachStatus_idx" ON "ContactMaster"("companyId", "loyaltyOutreachStatus");

-- AddForeignKey
ALTER TABLE "ContactMaster" ADD CONSTRAINT "ContactMaster_loyaltyAssignedByUserId_fkey" FOREIGN KEY ("loyaltyAssignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
