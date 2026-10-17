WITH live_pr_links AS (
    SELECT
        link."purchaseReceiptId",
        MIN(stock_return."name") AS "stockReturnName"
    FROM "GrnSupplierStockReturnPurchaseReceipt" link
    JOIN "GrnSupplierStockReturn" stock_return
      ON stock_return."id" = link."supplierStockReturnId"
    GROUP BY link."purchaseReceiptId"
    HAVING COUNT(DISTINCT link."supplierStockReturnId") = 1
)
UPDATE "GrnPurchaseReceipt" purchase_receipt
SET "supplierStockReturnName" = live_pr_links."stockReturnName"
FROM live_pr_links
WHERE purchase_receipt."id" = live_pr_links."purchaseReceiptId"
  AND purchase_receipt."supplierStockReturnName" IS NULL;

WITH first_live_links AS (
    SELECT DISTINCT ON (stock_return."id")
        stock_return."id" AS "stockReturnId",
        purchase_receipt."name" AS "purchaseReceiptName"
    FROM "GrnSupplierStockReturn" stock_return
    JOIN "GrnSupplierStockReturnPurchaseReceipt" link
      ON link."supplierStockReturnId" = stock_return."id"
    JOIN "GrnPurchaseReceipt" purchase_receipt
      ON purchase_receipt."id" = link."purchaseReceiptId"
    ORDER BY stock_return."id", link."createdAt", purchase_receipt."name"
)
UPDATE "GrnSupplierStockReturn" stock_return
SET "purchaseReceiptName" = first_live_links."purchaseReceiptName"
FROM first_live_links
WHERE stock_return."id" = first_live_links."stockReturnId"
  AND stock_return."purchaseReceiptName" IS NULL;

WITH first_backfill_links AS (
    SELECT DISTINCT ON (stock_return."id")
        stock_return."id" AS "stockReturnId",
        purchase_receipt."name" AS "purchaseReceiptName"
    FROM "GrnBackfillSupplierStockReturn" stock_return
    JOIN "GrnBackfillSupplierStockReturnPurchaseReceipt" link
      ON link."supplierStockReturnId" = stock_return."id"
    JOIN "GrnBackfillPurchaseReceipt" purchase_receipt
      ON purchase_receipt."id" = link."purchaseReceiptId"
    ORDER BY stock_return."id", link."createdAt", purchase_receipt."name"
)
UPDATE "GrnBackfillSupplierStockReturn" stock_return
SET "purchaseReceiptName" = first_backfill_links."purchaseReceiptName"
FROM first_backfill_links
WHERE stock_return."id" = first_backfill_links."stockReturnId"
  AND stock_return."purchaseReceiptName" IS NULL;
