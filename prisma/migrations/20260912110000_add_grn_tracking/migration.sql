CREATE TABLE "GrnPurchaseReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "supplierName" TEXT,
    "postingDate" TIMESTAMP(3),
    "postingTime" TEXT,
    "docstatus" INTEGER,
    "status" TEXT,
    "amendedFrom" TEXT,
    "owner" TEXT,
    "creation" TIMESTAMP(3),
    "handoverAt" TIMESTAMP(3),
    "valuedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "supplierStockReturnName" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnPurchaseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnPurchaseReceiptItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purchaseReceiptId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT,
    "qty" DECIMAL(18,6) NOT NULL,
    "stockQty" DECIMAL(18,6),
    "warehouse" TEXT,
    "stockUom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnPurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnSupplierStockReturn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3),
    "docstatus" INTEGER,
    "amendedFrom" TEXT,
    "owner" TEXT,
    "creation" TIMESTAMP(3),
    "purchaseReceiptName" TEXT,
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnSupplierStockReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnSupplierStockReturnItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierStockReturnId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT,
    "qty" DECIMAL(18,6) NOT NULL,
    "stockUom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrnSupplierStockReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnPurchaseReceipt_companyId_name_key" ON "GrnPurchaseReceipt"("companyId", "name");
CREATE INDEX "GrnPurchaseReceipt_companyId_creation_idx" ON "GrnPurchaseReceipt"("companyId", "creation" DESC);
CREATE INDEX "GrnPurchaseReceipt_companyId_supplier_idx" ON "GrnPurchaseReceipt"("companyId", "supplier");
CREATE INDEX "GrnPurchaseReceipt_companyId_amendedFrom_idx" ON "GrnPurchaseReceipt"("companyId", "amendedFrom");
CREATE INDEX "GrnPurchaseReceipt_companyId_supplierStockReturnName_idx" ON "GrnPurchaseReceipt"("companyId", "supplierStockReturnName");

CREATE UNIQUE INDEX "GrnPurchaseReceiptItem_purchaseReceiptId_name_key" ON "GrnPurchaseReceiptItem"("purchaseReceiptId", "name");
CREATE INDEX "GrnPurchaseReceiptItem_companyId_itemCode_idx" ON "GrnPurchaseReceiptItem"("companyId", "itemCode");

CREATE UNIQUE INDEX "GrnSupplierStockReturn_companyId_name_key" ON "GrnSupplierStockReturn"("companyId", "name");
CREATE INDEX "GrnSupplierStockReturn_companyId_creation_idx" ON "GrnSupplierStockReturn"("companyId", "creation" DESC);
CREATE INDEX "GrnSupplierStockReturn_companyId_supplier_idx" ON "GrnSupplierStockReturn"("companyId", "supplier");
CREATE INDEX "GrnSupplierStockReturn_companyId_amendedFrom_idx" ON "GrnSupplierStockReturn"("companyId", "amendedFrom");
CREATE INDEX "GrnSupplierStockReturn_companyId_purchaseReceiptName_idx" ON "GrnSupplierStockReturn"("companyId", "purchaseReceiptName");

CREATE UNIQUE INDEX "GrnSupplierStockReturnItem_supplierStockReturnId_name_key" ON "GrnSupplierStockReturnItem"("supplierStockReturnId", "name");
CREATE INDEX "GrnSupplierStockReturnItem_companyId_itemCode_idx" ON "GrnSupplierStockReturnItem"("companyId", "itemCode");

ALTER TABLE "GrnPurchaseReceipt"
ADD CONSTRAINT "GrnPurchaseReceipt_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrnPurchaseReceiptItem"
ADD CONSTRAINT "GrnPurchaseReceiptItem_purchaseReceiptId_fkey"
FOREIGN KEY ("purchaseReceiptId") REFERENCES "GrnPurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrnSupplierStockReturn"
ADD CONSTRAINT "GrnSupplierStockReturn_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrnSupplierStockReturnItem"
ADD CONSTRAINT "GrnSupplierStockReturnItem_supplierStockReturnId_fkey"
FOREIGN KEY ("supplierStockReturnId") REFERENCES "GrnSupplierStockReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
