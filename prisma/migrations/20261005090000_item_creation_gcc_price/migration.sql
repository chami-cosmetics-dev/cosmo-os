-- AlterTable
ALTER TABLE "ItemCreationRequest"
ADD COLUMN "gccPrice" DECIMAL(12,2),
ADD COLUMN "erp2GccPrice" DECIMAL(12,2),
ADD COLUMN "erp2GccPriceStatus" "ItemCreationPriceOperationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "erp2GccPriceError" TEXT,
ADD COLUMN "gccPriceSeenAt" TIMESTAMP(3);
