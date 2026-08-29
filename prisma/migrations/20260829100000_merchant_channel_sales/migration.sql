-- AlterTable
ALTER TABLE "EmployeeProfile" ADD COLUMN "isShopMerchant" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MerchantMonthlyTarget" ADD COLUMN "shopTargetAmount" DECIMAL(14,2),
ADD COLUMN "onlineTargetAmount" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "MerchantMonthlyTargetHistory" ADD COLUMN "shopTargetAmount" DECIMAL(14,2),
ADD COLUMN "onlineTargetAmount" DECIMAL(14,2);
