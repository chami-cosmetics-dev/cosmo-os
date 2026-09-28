-- Store the Cosmo location resolved from the ERP company on GRN purchase receipts.
ALTER TABLE "public"."GrnPurchaseReceipt"
ADD COLUMN "companyLocationId" TEXT;

UPDATE "public"."GrnPurchaseReceipt" pr
SET "companyLocationId" = cl."id"
FROM "public"."CompanyLocation" cl
WHERE pr."companyLocationId" IS NULL
  AND pr."companyId" = cl."companyId"
  AND cl."erpnextCompany" IS NOT NULL
  AND cl."erpnextCompany" = COALESCE(
    pr."rawPayload" #>> '{data,company}',
    pr."rawPayload" #>> '{company}'
  );

CREATE INDEX "GrnPurchaseReceipt_companyLocationId_idx"
ON "public"."GrnPurchaseReceipt"("companyLocationId");

ALTER TABLE "public"."GrnPurchaseReceipt"
ADD CONSTRAINT "GrnPurchaseReceipt_companyLocationId_fkey"
FOREIGN KEY ("companyLocationId")
REFERENCES "public"."CompanyLocation"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Move supplier stock return purchase invoice links from amended-from PRs to
-- the active amended PR that inherited the same SSR link.
UPDATE "public"."GrnPurchaseInvoice" pi
SET
  "purchaseReceiptId" = active_pr."id",
  "purchaseReceiptName" = active_pr."name"
FROM "public"."GrnPurchaseReceipt" old_pr
JOIN "public"."GrnPurchaseReceipt" active_pr
  ON active_pr."companyId" = old_pr."companyId"
  AND active_pr."amendedFrom" = old_pr."name"
  AND active_pr."supplierStockReturnName" IS NOT NULL
WHERE pi."purchaseReceiptId" = old_pr."id"
  AND pi."companyId" = active_pr."companyId"
  AND pi."docstatus" IS DISTINCT FROM 2
  AND (
    pi."supplierStockReturnName" = active_pr."supplierStockReturnName"
    OR pi."billNo" = ('SSR-' || active_pr."supplierStockReturnName")
    OR EXISTS (
      SELECT 1
      FROM "public"."GrnPurchaseInvoiceItem" item
      WHERE item."purchaseInvoiceId" = pi."id"
        AND item."supplierStockReturn" = active_pr."supplierStockReturnName"
    )
  );


-- Make active amended Purchase Invoices inherit the PR/SSR link from the
-- cancelled/original invoice when ERP sends the amendment without link fields.
UPDATE "public"."GrnPurchaseInvoice" amended_pi
SET
  "purchaseReceiptId" = original_pi."purchaseReceiptId",
  "purchaseReceiptName" = original_pi."purchaseReceiptName",
  "supplierStockReturnName" = COALESCE(amended_pi."supplierStockReturnName", original_pi."supplierStockReturnName")
FROM "public"."GrnPurchaseInvoice" original_pi
WHERE amended_pi."companyId" = original_pi."companyId"
  AND amended_pi."amendedFrom" = original_pi."name"
  AND amended_pi."docstatus" IS DISTINCT FROM 2
  AND original_pi."purchaseReceiptId" IS NOT NULL
  AND (
    amended_pi."purchaseReceiptId" IS NULL
    OR amended_pi."purchaseReceiptName" IS NULL
    OR (amended_pi."supplierStockReturnName" IS NULL AND original_pi."supplierStockReturnName" IS NOT NULL)
  );

UPDATE "public"."GrnPurchaseInvoiceItem" item
SET "purchaseReceipt" = pi."purchaseReceiptName"
FROM "public"."GrnPurchaseInvoice" pi
WHERE item."purchaseInvoiceId" = pi."id"
  AND item."purchaseReceipt" IS NULL
  AND pi."purchaseReceiptName" IS NOT NULL
  AND pi."docstatus" IS DISTINCT FROM 2
  AND pi."isReturn" IS DISTINCT FROM 1;

UPDATE "public"."GrnPurchaseInvoiceItem" item
SET "supplierStockReturn" = pi."supplierStockReturnName"
FROM "public"."GrnPurchaseInvoice" pi
WHERE item."purchaseInvoiceId" = pi."id"
  AND item."supplierStockReturn" IS NULL
  AND pi."supplierStockReturnName" IS NOT NULL
  AND pi."docstatus" IS DISTINCT FROM 2
  AND pi."isReturn" = 1;
