-- AlterTable
ALTER TABLE "ItemCreationRequest"
ADD COLUMN "addErp1OgfPrice" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "erp1OgfPrice" DECIMAL(12,2),
ADD COLUMN "erp1OgfPriceStatus" "ItemCreationPriceOperationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "erp1OgfPriceError" TEXT;
