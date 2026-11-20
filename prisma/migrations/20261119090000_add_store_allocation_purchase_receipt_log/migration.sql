CREATE TABLE "StoreAllocationPurchaseReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "erpInstanceId" TEXT NOT NULL,
    "erpLabel" TEXT NOT NULL,
    "erpCompany" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATING',
    "purchaseReceipt" TEXT,
    "error" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StoreAllocationPurchaseReceipt_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ItemCreationStockReceiptItem" ADD COLUMN "warehouse" TEXT;

CREATE INDEX "StoreAllocationPurchaseReceipt_companyId_status_createdAt_idx"
    ON "StoreAllocationPurchaseReceipt"("companyId", "status", "createdAt");

ALTER TABLE "StoreAllocationPurchaseReceipt"
    ADD CONSTRAINT "StoreAllocationPurchaseReceipt_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
