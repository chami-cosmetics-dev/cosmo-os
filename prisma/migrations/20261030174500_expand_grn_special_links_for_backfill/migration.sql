ALTER TABLE "GrnSpecialLink"
  ADD COLUMN IF NOT EXISTS "supplierStockReturnName" TEXT,
  ADD COLUMN IF NOT EXISTS "supplierStockReturnIsBackfill" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "purchaseReceiptName" TEXT,
  ADD COLUMN IF NOT EXISTS "purchaseReceiptIsBackfill" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  -- Older installs stored relation IDs. Newer installs already create the
  -- name-based columns, so only migrate IDs when those legacy columns exist.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'GrnSpecialLink'
      AND column_name = 'supplierStockReturnId'
  ) THEN
    UPDATE "GrnSpecialLink" link
    SET "supplierStockReturnName" = stock_return."name"
    FROM "GrnSupplierStockReturn" stock_return
    WHERE stock_return."id" = link."supplierStockReturnId";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'GrnSpecialLink'
      AND column_name = 'purchaseReceiptId'
  ) THEN
    UPDATE "GrnSpecialLink" link
    SET "purchaseReceiptName" = purchase_receipt."name"
    FROM "GrnPurchaseReceipt" purchase_receipt
    WHERE purchase_receipt."id" = link."purchaseReceiptId";
  END IF;
END $$;

ALTER TABLE "GrnSpecialLink"
  ALTER COLUMN "supplierStockReturnName" SET NOT NULL,
  ALTER COLUMN "purchaseReceiptName" SET NOT NULL;

ALTER TABLE "GrnSpecialLink" DROP CONSTRAINT IF EXISTS "GrnSpecialLink_supplierStockReturnId_fkey";
ALTER TABLE "GrnSpecialLink" DROP CONSTRAINT IF EXISTS "GrnSpecialLink_purchaseReceiptId_fkey";
DROP INDEX IF EXISTS "GrnSpecialLink_supplierStockReturnId_purchaseReceiptId_key";
DROP INDEX IF EXISTS "GrnSpecialLink_companyId_supplierStockReturnId_idx";
DROP INDEX IF EXISTS "GrnSpecialLink_companyId_purchaseReceiptId_idx";

ALTER TABLE "GrnSpecialLink"
  DROP COLUMN IF EXISTS "supplierStockReturnId",
  DROP COLUMN IF EXISTS "purchaseReceiptId";

CREATE UNIQUE INDEX IF NOT EXISTS "GrnSpecialLink_pair_key"
ON "GrnSpecialLink"("companyId", "supplierStockReturnName", "supplierStockReturnIsBackfill", "purchaseReceiptName", "purchaseReceiptIsBackfill");

CREATE INDEX IF NOT EXISTS "GrnSpecialLink_ssr_lookup_idx"
ON "GrnSpecialLink"("companyId", "supplierStockReturnName", "supplierStockReturnIsBackfill");

CREATE INDEX IF NOT EXISTS "GrnSpecialLink_pr_lookup_idx"
ON "GrnSpecialLink"("companyId", "purchaseReceiptName", "purchaseReceiptIsBackfill");
