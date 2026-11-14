-- AlterTable
ALTER TABLE "ContactMaster" ADD COLUMN "loyaltyAssignedReason" TEXT;

-- CreateTable
CREATE TABLE "LoyaltyReasonTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "syncKey" TEXT NOT NULL,
    "osScope" TEXT NOT NULL,
    "seeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyReasonTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyReasonTemplate_companyId_osScope_idx" ON "LoyaltyReasonTemplate"("companyId", "osScope");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyReasonTemplate_companyId_normalizedLabel_key" ON "LoyaltyReasonTemplate"("companyId", "normalizedLabel");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyReasonTemplate_companyId_syncKey_key" ON "LoyaltyReasonTemplate"("companyId", "syncKey");

-- AddForeignKey
ALTER TABLE "LoyaltyReasonTemplate" ADD CONSTRAINT "LoyaltyReasonTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
