import { isRealErpSalesInvoiceId } from "@/lib/approval-workflow";
import {
  isErpOutOfStockSyncError,
  parseOutOfStockItemFromError,
} from "@/lib/failed-erp-sync-classification";

export const ERP_OUT_OF_STOCK_FULFILLMENT_ERROR =
  "This order cannot proceed through fulfillment until ERP stock is available and sync succeeds.";

/** Same columns as ERP_SYNC_SUCCESS_CLEAR — keep this module off the auto-retry import graph. */
const ERP_INVOICE_LINKED_SYNC_CLEAR = {
  erpnextSyncError: null,
  erpnextSyncFailedAt: null,
  erpnextSyncStartedAt: null,
  erpnextSyncAutoRetryCount: 0,
  erpnextSyncLastAutoRetryAt: null,
  erpnextSyncNextAutoRetryAt: null,
  erpnextSyncRetryLeaseExpiresAt: null,
} as const;

export function isErpOutOfStockFulfillmentBlocked(input: {
  erpnextSyncError?: string | null;
  erpnextInvoiceId?: string | null;
}): boolean {
  if (isRealErpSalesInvoiceId(input.erpnextInvoiceId)) return false;
  return isErpOutOfStockSyncError(input.erpnextSyncError);
}

/** User-facing block reason when fulfillment is denied due to ERP out-of-stock sync failure. */
export function getErpOutOfStockFulfillmentBlock(
  syncError: string | null | undefined,
  invoiceId?: string | null,
): string | null {
  if (!isErpOutOfStockFulfillmentBlocked({ erpnextSyncError: syncError, erpnextInvoiceId: invoiceId })) {
    return null;
  }

  const item = syncError ? parseOutOfStockItemFromError(syncError) : null;
  if (item?.sku) {
    const namePart = item.itemName ? ` (${item.itemName})` : "";
    return `ERP sync blocked: out of stock for ${item.sku}${namePart}. Restock in ERP and retry sync before fulfillment.`;
  }

  return ERP_OUT_OF_STOCK_FULFILLMENT_ERROR;
}

/** Cosmo web/manual order matched an ERP-submitted SI — link SI and clear stale Cosmo sync fail. */
export function linkedVaultOrderSubmittedInvoicePatch(input: {
  invoiceName: string;
  customer?: string | null;
}) {
  const customerId = input.customer?.trim() || null;
  return {
    erpnextInvoiceId: input.invoiceName,
    ...(customerId ? { erpnextCustomerId: customerId } : {}),
    ...ERP_INVOICE_LINKED_SYNC_CLEAR,
  };
}
