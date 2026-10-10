import type { StockLookupStatus, StockRequestStatus } from "@/lib/wishlist-buddy/constants";
import type { StockSource } from "@/lib/wishlist-buddy/stock-sources";

/** JSON-safe stock request row for the Stock Requests screen. */
export type StockRequestItem = {
  id: string;
  createdAt: string;
  sku: string | null;
  productTitle: string;
  variantTitle: string | null;
  productUrl: string | null;
  customerName: string;
  /** At least one of email / phone is set. */
  customerEmail: string | null;
  customerPhone: string | null;
  status: StockRequestStatus;
  remark: string | null;
  soldFromInstanceId: string | null;
  soldFromWarehouse: string | null;
  stockLookupStatus: StockLookupStatus;
  stockLookupAt: string | null;
  stockSources: StockSource[];
  stockLookupError: string | null;
  availabilityEmailSentAt: string | null;
  restockEmailSentAt: string | null;
  restockEmailError: string | null;
  /** When Shopify inventory came back while the request was open. */
  restockedAt: string | null;
  /** shopify | import */
  source: string;
  lastActionAt: string | null;
  lastActionBy: { id: string; name: string | null; email: string | null } | null;
};

export type StockRequestListResponse = {
  items: StockRequestItem[];
  total: number;
  page: number;
  limit: number;
};
