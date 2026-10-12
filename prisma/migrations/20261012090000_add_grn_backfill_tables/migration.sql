CREATE TABLE "GrnBackfillPurchaseReceipt" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "companyLocationId" TEXT,
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
  "rawPayload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrnBackfillPurchaseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnBackfillPurchaseReceiptItem" (
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
  CONSTRAINT "GrnBackfillPurchaseReceiptItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnBackfillSupplierStockReturn" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "supplierName" TEXT,
  "returnDate" TIMESTAMP(3),
  "docstatus" INTEGER,
  "amendedFrom" TEXT,
  "owner" TEXT,
  "creation" TIMESTAMP(3),
  "purchaseReceiptName" TEXT,
  "rawPayload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrnBackfillSupplierStockReturn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnBackfillSupplierStockReturnItem" (
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
  CONSTRAINT "GrnBackfillSupplierStockReturnItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnBackfillPurchaseReceipt_companyId_name_key" ON "GrnBackfillPurchaseReceipt"("companyId", "name");
CREATE INDEX "GrnBackfillPurchaseReceipt_companyId_creation_idx" ON "GrnBackfillPurchaseReceipt"("companyId", "creation" DESC);
CREATE INDEX "GrnBackfillPurchaseReceipt_companyId_supplier_idx" ON "GrnBackfillPurchaseReceipt"("companyId", "supplier");
CREATE INDEX "GrnBackfillPurchaseReceipt_companyId_amendedFrom_idx" ON "GrnBackfillPurchaseReceipt"("companyId", "amendedFrom");
CREATE INDEX "GrnBackfillPurchaseReceipt_companyLocationId_idx" ON "GrnBackfillPurchaseReceipt"("companyLocationId");

CREATE UNIQUE INDEX "GrnBackfillPurchaseReceiptItem_purchaseReceiptId_name_key" ON "GrnBackfillPurchaseReceiptItem"("purchaseReceiptId", "name");
CREATE INDEX "GrnBackfillPurchaseReceiptItem_companyId_itemCode_idx" ON "GrnBackfillPurchaseReceiptItem"("companyId", "itemCode");

CREATE UNIQUE INDEX "GrnBackfillSupplierStockReturn_companyId_name_key" ON "GrnBackfillSupplierStockReturn"("companyId", "name");
CREATE INDEX "GrnBackfillSupplierStockReturn_companyId_creation_idx" ON "GrnBackfillSupplierStockReturn"("companyId", "creation" DESC);
CREATE INDEX "GrnBackfillSupplierStockReturn_companyId_supplier_idx" ON "GrnBackfillSupplierStockReturn"("companyId", "supplier");
CREATE INDEX "GrnBackfillSupplierStockReturn_companyId_supplierName_idx" ON "GrnBackfillSupplierStockReturn"("companyId", "supplierName");
CREATE INDEX "GrnBackfillSupplierStockReturn_companyId_amendedFrom_idx" ON "GrnBackfillSupplierStockReturn"("companyId", "amendedFrom");
CREATE INDEX "GrnBackfillSupplierStockReturn_companyId_purchaseReceiptName_idx" ON "GrnBackfillSupplierStockReturn"("companyId", "purchaseReceiptName");

CREATE UNIQUE INDEX "GrnBackfillSupplierStockReturnItem_supplierStockReturnId_name_key" ON "GrnBackfillSupplierStockReturnItem"("supplierStockReturnId", "name");
CREATE INDEX "GrnBackfillSupplierStockReturnItem_companyId_itemCode_idx" ON "GrnBackfillSupplierStockReturnItem"("companyId", "itemCode");

ALTER TABLE "GrnBackfillPurchaseReceipt"
  ADD CONSTRAINT "GrnBackfillPurchaseReceipt_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrnBackfillPurchaseReceipt"
  ADD CONSTRAINT "GrnBackfillPurchaseReceipt_companyLocationId_fkey"
  FOREIGN KEY ("companyLocationId") REFERENCES "CompanyLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GrnBackfillPurchaseReceiptItem"
  ADD CONSTRAINT "GrnBackfillPurchaseReceiptItem_purchaseReceiptId_fkey"
  FOREIGN KEY ("purchaseReceiptId") REFERENCES "GrnBackfillPurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrnBackfillSupplierStockReturn"
  ADD CONSTRAINT "GrnBackfillSupplierStockReturn_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrnBackfillSupplierStockReturnItem"
  ADD CONSTRAINT "GrnBackfillSupplierStockReturnItem_supplierStockReturnId_fkey"
  FOREIGN KEY ("supplierStockReturnId") REFERENCES "GrnBackfillSupplierStockReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GrnBackfillPurchaseInvoice" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "supplierName" TEXT,
  "postingDate" TIMESTAMP(3),
  "docstatus" INTEGER,
  "status" TEXT,
  "isReturn" INTEGER,
  "returnAgainst" TEXT,
  "billNo" TEXT,
  "amendedFrom" TEXT,
  "owner" TEXT,
  "creation" TIMESTAMP(3),
  "purchaseReceiptName" TEXT,
  "supplierStockReturnName" TEXT,
  "rawPayload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrnBackfillPurchaseInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnBackfillPurchaseInvoiceItem" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "purchaseInvoiceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "itemCode" TEXT NOT NULL,
  "itemName" TEXT,
  "qty" DECIMAL(18,6) NOT NULL,
  "rate" DECIMAL(18,6) NOT NULL,
  "amount" DECIMAL(18,6) NOT NULL,
  "purchaseReceipt" TEXT,
  "purchaseReceiptItem" TEXT,
  "supplierStockReturn" TEXT,
  "supplierStockReturnItem" TEXT,
  "stockUom" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GrnBackfillPurchaseInvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnBackfillPurchaseInvoice_companyId_name_key" ON "GrnBackfillPurchaseInvoice"("companyId", "name");
CREATE INDEX "GrnBackfillPurchaseInvoice_companyId_purchaseReceiptName_idx" ON "GrnBackfillPurchaseInvoice"("companyId", "purchaseReceiptName");
CREATE INDEX "GrnBackfillPurchaseInvoice_companyId_supplierStockReturnName_idx" ON "GrnBackfillPurchaseInvoice"("companyId", "supplierStockReturnName");
CREATE INDEX "GrnBackfillPurchaseInvoice_companyId_returnAgainst_idx" ON "GrnBackfillPurchaseInvoice"("companyId", "returnAgainst");
CREATE INDEX "GrnBackfillPurchaseInvoice_companyId_billNo_idx" ON "GrnBackfillPurchaseInvoice"("companyId", "billNo");
CREATE INDEX "GrnBackfillPurchaseInvoice_companyId_postingDate_idx" ON "GrnBackfillPurchaseInvoice"("companyId", "postingDate");

CREATE UNIQUE INDEX "GrnBackfillPurchaseInvoiceItem_purchaseInvoiceId_name_key" ON "GrnBackfillPurchaseInvoiceItem"("purchaseInvoiceId", "name");
CREATE INDEX "GrnBackfillPurchaseInvoiceItem_companyId_itemCode_idx" ON "GrnBackfillPurchaseInvoiceItem"("companyId", "itemCode");
CREATE INDEX "GrnBackfillPurchaseInvoiceItem_companyId_purchaseReceipt_idx" ON "GrnBackfillPurchaseInvoiceItem"("companyId", "purchaseReceipt");
CREATE INDEX "GrnBackfillPurchaseInvoiceItem_companyId_supplierStockReturn_idx" ON "GrnBackfillPurchaseInvoiceItem"("companyId", "supplierStockReturn");

ALTER TABLE "GrnBackfillPurchaseInvoice"
  ADD CONSTRAINT "GrnBackfillPurchaseInvoice_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrnBackfillPurchaseInvoiceItem"
  ADD CONSTRAINT "GrnBackfillPurchaseInvoiceItem_purchaseInvoiceId_fkey"
  FOREIGN KEY ("purchaseInvoiceId") REFERENCES "GrnBackfillPurchaseInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
