-- Wholesale MER codes on staff + separate wholesale monthly targets
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "wholesaleCouponCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "MerchantMonthlyTarget" ADD COLUMN IF NOT EXISTS "wholesaleTargetAmount" DECIMAL(14,2);

ALTER TABLE "MerchantMonthlyTargetHistory" ADD COLUMN IF NOT EXISTS "wholesaleTargetAmount" DECIMAL(14,2);
