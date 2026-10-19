CREATE TABLE "GrnSupplierStockReturnPurchaseReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierStockReturnId" TEXT NOT NULL,
    "purchaseReceiptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrnSupplierStockReturnPurchaseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GrnBackfillSupplierStockReturnPurchaseReceipt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierStockReturnId" TEXT NOT NULL,
    "purchaseReceiptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GrnBackfillSupplierStockReturnPurchaseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GrnSupplierStockReturnPurchaseReceipt_supplierStockReturnId_purchaseReceiptId_key"
ON "GrnSupplierStockReturnPurchaseReceipt"("supplierStockReturnId", "purchaseReceiptId");
CREATE INDEX "GrnSupplierStockReturnPurchaseReceipt_companyId_supplierStockReturnId_idx"
ON "GrnSupplierStockReturnPurchaseReceipt"("companyId", "supplierStockReturnId");
CREATE INDEX "GrnSupplierStockReturnPurchaseReceipt_companyId_purchaseReceiptId_idx"
ON "GrnSupplierStockReturnPurchaseReceipt"("companyId", "purchaseReceiptId");

CREATE UNIQUE INDEX "GrnBackfillSupplierStockReturnPurchaseReceipt_supplierStockReturnId_purchaseReceiptId_key"
ON "GrnBackfillSupplierStockReturnPurchaseReceipt"("supplierStockReturnId", "purchaseReceiptId");
CREATE INDEX "GrnBackfillSupplierStockReturnPurchaseReceipt_companyId_supplierStockReturnId_idx"
ON "GrnBackfillSupplierStockReturnPurchaseReceipt"("companyId", "supplierStockReturnId");
CREATE INDEX "GrnBackfillSupplierStockReturnPurchaseReceipt_companyId_purchaseReceiptId_idx"
ON "GrnBackfillSupplierStockReturnPurchaseReceipt"("companyId", "purchaseReceiptId");

ALTER TABLE "GrnSupplierStockReturnPurchaseReceipt"
ADD CONSTRAINT "GrnSupplierStockReturnPurchaseReceipt_supplierStockReturnId_fkey"
FOREIGN KEY ("supplierStockReturnId") REFERENCES "GrnSupplierStockReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrnSupplierStockReturnPurchaseReceipt"
ADD CONSTRAINT "GrnSupplierStockReturnPurchaseReceipt_purchaseReceiptId_fkey"
FOREIGN KEY ("purchaseReceiptId") REFERENCES "GrnPurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GrnBackfillSupplierStockReturnPurchaseReceipt"
ADD CONSTRAINT "GrnBackfillSupplierStockReturnPurchaseReceipt_supplierStockReturnId_fkey"
FOREIGN KEY ("supplierStockReturnId") REFERENCES "GrnBackfillSupplierStockReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrnBackfillSupplierStockReturnPurchaseReceipt"
ADD CONSTRAINT "GrnBackfillSupplierStockReturnPurchaseReceipt_purchaseReceiptId_fkey"
FOREIGN KEY ("purchaseReceiptId") REFERENCES "GrnBackfillPurchaseReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "GrnSupplierStockReturnPurchaseReceipt" ("id", "companyId", "supplierStockReturnId", "purchaseReceiptId", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), sr."companyId", sr."id", pr."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "GrnSupplierStockReturn" sr
JOIN "GrnPurchaseReceipt" pr
  ON pr."companyId" = sr."companyId" AND pr."name" = sr."purchaseReceiptName"
WHERE sr."purchaseReceiptName" IS NOT NULL
ON CONFLICT ("supplierStockReturnId", "purchaseReceiptId") DO NOTHING;

INSERT INTO "GrnBackfillSupplierStockReturnPurchaseReceipt" ("id", "companyId", "supplierStockReturnId", "purchaseReceiptId", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), sr."companyId", sr."id", pr."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "GrnBackfillSupplierStockReturn" sr
JOIN "GrnBackfillPurchaseReceipt" pr
  ON pr."companyId" = sr."companyId" AND pr."name" = sr."purchaseReceiptName"
WHERE sr."purchaseReceiptName" IS NOT NULL
ON CONFLICT ("supplierStockReturnId", "purchaseReceiptId") DO NOTHING;
