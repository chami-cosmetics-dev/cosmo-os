/** Staff follow-up status for a Wishlist Buddy stock request. */
export const STOCK_REQUEST_STATUSES = [
  "new",
  "contacted",
  "order_placed",
  "not_interested",
] as const;

export type StockRequestStatus = (typeof STOCK_REQUEST_STATUSES)[number];

export const STOCK_REQUEST_STATUS_LABELS: Record<StockRequestStatus, string> = {
  new: "New",
  contacted: "Contacted",
  order_placed: "Order placed",
  not_interested: "Not interested",
};

/** Requests in these statuses still get the back-in-stock email. Contacted does not close a request. */
export const OPEN_STOCK_REQUEST_STATUSES: readonly StockRequestStatus[] = ["new", "contacted"];

export function isStockRequestStatus(value: unknown): value is StockRequestStatus {
  return typeof value === "string" && (STOCK_REQUEST_STATUSES as readonly string[]).includes(value);
}

/** Result of the cross-warehouse ERP lookup done when a request arrives. */
export const STOCK_LOOKUP_STATUSES = ["pending", "found", "none", "error", "no_sku", "skipped"] as const;

export type StockLookupStatus = (typeof STOCK_LOOKUP_STATUSES)[number];

export function isStockLookupStatus(value: unknown): value is StockLookupStatus {
  return typeof value === "string" && (STOCK_LOOKUP_STATUSES as readonly string[]).includes(value);
}

export const STOCK_LOOKUP_STATUS_LABELS: Record<StockLookupStatus, string> = {
  pending: "Checking stock",
  found: "Stock in other warehouses",
  none: "No stock anywhere",
  error: "Stock check failed",
  no_sku: "No SKU on Shopify variant",
  skipped: "Stock check off",
};
