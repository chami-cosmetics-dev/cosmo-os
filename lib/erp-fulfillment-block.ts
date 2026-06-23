import {
  isErpOutOfStockSyncError,
  parseOutOfStockItemFromError,
} from "@/lib/failed-erp-sync-classification";

export const ERP_OUT_OF_STOCK_FULFILLMENT_ERROR =
  "This order cannot proceed through fulfillment until ERP stock is available and sync succeeds.";

/** User-facing block reason when fulfillment is denied due to ERP out-of-stock sync failure. */
export function getErpOutOfStockFulfillmentBlock(
  syncError: string | null | undefined,
): string | null {
  if (!isErpOutOfStockSyncError(syncError)) return null;

  const item = syncError ? parseOutOfStockItemFromError(syncError) : null;
  if (item?.sku) {
    const namePart = item.itemName ? ` (${item.itemName})` : "";
    return `ERP sync blocked: out of stock for ${item.sku}${namePart}. Restock in ERP and retry sync before fulfillment.`;
  }

  return ERP_OUT_OF_STOCK_FULFILLMENT_ERROR;
}
