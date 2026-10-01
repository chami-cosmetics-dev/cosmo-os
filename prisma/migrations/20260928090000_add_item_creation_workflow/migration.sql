CREATE TYPE "ItemCreationOverallStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ItemCreationSeoSetupStatus" AS ENUM ('PENDING', 'ITEM_CREATED', 'COMPLETED');
CREATE TYPE "ItemCreationSeoActivationStatus" AS ENUM ('LOCKED', 'WAITING_ACTIVATION', 'ACTIVATED');
CREATE TYPE "ItemCreationDigitalStatus" AS ENUM ('PENDING', 'IMAGE_CREATED');
CREATE TYPE "ItemCreationPurchasingStatus" AS ENUM ('LOCKED', 'WAITING_FOR_PRICES', 'PRICE_UPDATED');
CREATE TYPE "ItemCreationStoreTransferStatus" AS ENUM ('PENDING', 'SENT', 'RECEIVED');
CREATE TYPE "ItemCreationStoreStockStatus" AS ENUM ('WAITING_FOR_PRICE', 'READY_FOR_STOCK', 'STOCK_ADDED');
CREATE TYPE "ItemCreationUpdateSource" AS ENUM ('USER', 'ERP_WEBHOOK', 'SYSTEM');

CREATE TABLE "ItemCreationRequest" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "standardPrice" DECIMAL(12,2) NOT NULL,
  "ogfPrice" DECIMAL(12,2),
  "country" TEXT NOT NULL,
  "overallStatus" "ItemCreationOverallStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "seoSetupStatus" "ItemCreationSeoSetupStatus" NOT NULL DEFAULT 'PENDING',
  "seoActivationStatus" "ItemCreationSeoActivationStatus" NOT NULL DEFAULT 'LOCKED',
  "digitalMarketingStatus" "ItemCreationDigitalStatus" NOT NULL DEFAULT 'PENDING',
  "purchasingStatus" "ItemCreationPurchasingStatus" NOT NULL DEFAULT 'LOCKED',
  "storeTransferStatus" "ItemCreationStoreTransferStatus" NOT NULL DEFAULT 'PENDING',
  "storeStockStatus" "ItemCreationStoreStockStatus" NOT NULL DEFAULT 'WAITING_FOR_PRICE',
  "imageDriveUrl" TEXT,
  "itemCreatedAt" TIMESTAMP(3),
  "itemCreatedBy" TEXT,
  "imageCreatedAt" TIMESTAMP(3),
  "imageCreatedBy" TEXT,
  "imageUpdatedAt" TIMESTAMP(3),
  "imageUpdatedBy" TEXT,
  "erpStandardPrice" DECIMAL(12,2),
  "erpOgfPrice" DECIMAL(12,2),
  "standardPriceSeenAt" TIMESTAMP(3),
  "ogfPriceSeenAt" TIMESTAMP(3),
  "priceUpdatedAt" TIMESTAMP(3),
  "priceUpdatedBy" TEXT,
  "priceUpdatedSource" "ItemCreationUpdateSource",
  "sentAt" TIMESTAMP(3),
  "sentBy" TEXT,
  "receivedAt" TIMESTAMP(3),
  "receivedBy" TEXT,
  "stockReadyAt" TIMESTAMP(3),
  "stockAddedAt" TIMESTAMP(3),
  "stockAddedBy" TEXT,
  "stockAddedSource" "ItemCreationUpdateSource",
  "activatedAt" TIMESTAMP(3),
  "activatedBy" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ItemCreationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ItemCreationActivity" (
  "id" TEXT NOT NULL,
  "itemRequestId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" "ItemCreationUpdateSource" NOT NULL,
  "userId" TEXT,
  "oldValue" TEXT,
  "newValue" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemCreationActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ItemCreationRequest_companyId_sku_idx" ON "ItemCreationRequest"("companyId", "sku");
CREATE INDEX "ItemCreationRequest_companyId_overallStatus_idx" ON "ItemCreationRequest"("companyId", "overallStatus");
CREATE INDEX "ItemCreationRequest_sku_idx" ON "ItemCreationRequest"("sku");
CREATE INDEX "ItemCreationRequest_overallStatus_idx" ON "ItemCreationRequest"("overallStatus");
CREATE UNIQUE INDEX "ItemCreationRequest_active_sku_key" ON "ItemCreationRequest"("companyId", "sku") WHERE "overallStatus" = 'IN_PROGRESS';
CREATE INDEX "ItemCreationActivity_itemRequestId_idx" ON "ItemCreationActivity"("itemRequestId");
CREATE INDEX "ItemCreationActivity_createdAt_idx" ON "ItemCreationActivity"("createdAt");

ALTER TABLE "ItemCreationRequest"
  ADD CONSTRAINT "ItemCreationRequest_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemCreationActivity"
  ADD CONSTRAINT "ItemCreationActivity_itemRequestId_fkey"
  FOREIGN KEY ("itemRequestId") REFERENCES "ItemCreationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
