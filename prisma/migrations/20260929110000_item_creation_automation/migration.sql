-- CreateEnum
CREATE TYPE "ItemCreationErp" AS ENUM ('ERP1', 'ERP2');

-- CreateEnum
CREATE TYPE "ItemCreationErp2ItemStatus" AS ENUM ('WAITING_ERP1', 'CREATING_ERP2', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ItemCreationPriceOperationStatus" AS ENUM ('PENDING', 'UPDATING', 'UPDATED', 'FAILED', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "ItemCreationStockReceiptStatus" AS ENUM ('PENDING', 'CREATING', 'SUBMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ItemCreationShopifyActivationStatus" AS ENUM ('LOCKED', 'WAITING', 'ACTIVATING', 'ACTIVE', 'FAILED');

-- AlterTable
ALTER TABLE "ItemCreationRequest"
ADD COLUMN "erp1ItemCode" TEXT,
ADD COLUMN "erp1ItemName" TEXT,
ADD COLUMN "erp1Brand" TEXT,
ADD COLUMN "erp1Barcodes" JSONB,
ADD COLUMN "erp1ItemCreatedAt" TIMESTAMP(3),
ADD COLUMN "erp2ItemCode" TEXT,
ADD COLUMN "erp2ItemCreatedAt" TIMESTAMP(3),
ADD COLUMN "erp2ItemCreationStatus" "ItemCreationErp2ItemStatus" NOT NULL DEFAULT 'WAITING_ERP1',
ADD COLUMN "erp2ItemCreationError" TEXT,
ADD COLUMN "erp1StandardPrice" DECIMAL(12,2),
ADD COLUMN "erp2StandardPrice" DECIMAL(12,2),
ADD COLUMN "erp2OgfPrice" DECIMAL(12,2),
ADD COLUMN "erp1StandardPriceStatus" "ItemCreationPriceOperationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "erp2StandardPriceStatus" "ItemCreationPriceOperationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "erp2OgfPriceStatus" "ItemCreationPriceOperationStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN "erp1StandardPriceError" TEXT,
ADD COLUMN "erp2StandardPriceError" TEXT,
ADD COLUMN "erp2OgfPriceError" TEXT,
ADD COLUMN "pricesUpdatedAt" TIMESTAMP(3),
ADD COLUMN "pricesUpdatedBy" TEXT,
ADD COLUMN "shopifyProductId" TEXT,
ADD COLUMN "shopifyVariantId" TEXT,
ADD COLUMN "shopifyActivationStatus" "ItemCreationShopifyActivationStatus" NOT NULL DEFAULT 'LOCKED',
ADD COLUMN "shopifyActivatedAt" TIMESTAMP(3),
ADD COLUMN "shopifyActivationError" TEXT;

-- CreateTable
CREATE TABLE "ItemCreationStockReceipt" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "erp" "ItemCreationErp" NOT NULL,
  "supplier" TEXT NOT NULL,
  "warehouse" TEXT NOT NULL,
  "purchaseReceipt" TEXT,
  "status" "ItemCreationStockReceiptStatus" NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "submittedAt" TIMESTAMP(3),

  CONSTRAINT "ItemCreationStockReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCreationStockReceiptItem" (
  "id" TEXT NOT NULL,
  "stockReceiptId" TEXT NOT NULL,
  "itemRequestId" TEXT NOT NULL,
  "itemCode" TEXT NOT NULL,
  "qty" DECIMAL(12,3) NOT NULL,

  CONSTRAINT "ItemCreationStockReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemCreationStockReceipt_companyId_erp_idx" ON "ItemCreationStockReceipt"("companyId", "erp");

-- CreateIndex
CREATE INDEX "ItemCreationStockReceipt_purchaseReceipt_idx" ON "ItemCreationStockReceipt"("purchaseReceipt");

-- CreateIndex
CREATE INDEX "ItemCreationStockReceipt_status_idx" ON "ItemCreationStockReceipt"("status");

-- CreateIndex
CREATE INDEX "ItemCreationStockReceiptItem_itemRequestId_idx" ON "ItemCreationStockReceiptItem"("itemRequestId");

-- CreateIndex
CREATE INDEX "ItemCreationStockReceiptItem_stockReceiptId_idx" ON "ItemCreationStockReceiptItem"("stockReceiptId");

-- AddForeignKey
ALTER TABLE "ItemCreationStockReceipt" ADD CONSTRAINT "ItemCreationStockReceipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCreationStockReceiptItem" ADD CONSTRAINT "ItemCreationStockReceiptItem_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "ItemCreationStockReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCreationStockReceiptItem" ADD CONSTRAINT "ItemCreationStockReceiptItem_itemRequestId_fkey" FOREIGN KEY ("itemRequestId") REFERENCES "ItemCreationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
