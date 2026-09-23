-- Supplier allowlist used to narrow automated GRN SSR/PR matching.
CREATE TABLE "GrnIntercompanySupplier" (
  "id" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "supplierName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GrnIntercompanySupplier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnIntercompanySupplier_supplier_key"
  ON "GrnIntercompanySupplier"("supplier");

CREATE INDEX "GrnIntercompanySupplier_supplier_idx"
  ON "GrnIntercompanySupplier"("supplier");

-- Linked Purchase Invoice data used for SSR/PR price tallying.
CREATE TABLE "GrnPurchaseInvoice" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "purchaseReceiptId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "supplier" TEXT NOT NULL,
  "supplierName" TEXT,
  "postingDate" TIMESTAMP(3),
  "docstatus" INTEGER,
  "status" TEXT,
  "amendedFrom" TEXT,
  "owner" TEXT,
  "creation" TIMESTAMP(3),
  "purchaseReceiptName" TEXT NOT NULL,
  "supplierStockReturnName" TEXT NOT NULL,
  "rawPayload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GrnPurchaseInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnPurchaseInvoiceItem" (
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
  "stockUom" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GrnPurchaseInvoiceItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnPurchaseInvoice_companyId_name_key"
  ON "GrnPurchaseInvoice"("companyId", "name");

CREATE INDEX "GrnPurchaseInvoice_companyId_purchaseReceiptName_idx"
  ON "GrnPurchaseInvoice"("companyId", "purchaseReceiptName");

CREATE INDEX "GrnPurchaseInvoice_companyId_supplierStockReturnName_idx"
  ON "GrnPurchaseInvoice"("companyId", "supplierStockReturnName");

CREATE INDEX "GrnPurchaseInvoice_purchaseReceiptId_idx"
  ON "GrnPurchaseInvoice"("purchaseReceiptId");

CREATE UNIQUE INDEX "GrnPurchaseInvoiceItem_purchaseInvoiceId_name_key"
  ON "GrnPurchaseInvoiceItem"("purchaseInvoiceId", "name");

CREATE INDEX "GrnPurchaseInvoiceItem_companyId_itemCode_idx"
  ON "GrnPurchaseInvoiceItem"("companyId", "itemCode");

CREATE INDEX "GrnPurchaseInvoiceItem_companyId_purchaseReceipt_idx"
  ON "GrnPurchaseInvoiceItem"("companyId", "purchaseReceipt");

ALTER TABLE "GrnPurchaseInvoice"
  ADD CONSTRAINT "GrnPurchaseInvoice_purchaseReceiptId_fkey"
  FOREIGN KEY ("purchaseReceiptId")
  REFERENCES "GrnPurchaseReceipt"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "GrnPurchaseInvoiceItem"
  ADD CONSTRAINT "GrnPurchaseInvoiceItem_purchaseInvoiceId_fkey"
  FOREIGN KEY ("purchaseInvoiceId")
  REFERENCES "GrnPurchaseInvoice"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

