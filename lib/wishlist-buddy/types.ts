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
  customerEmail: string;
  customerPhone: string;
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
  lastActionAt: string | null;
  lastActionBy: { id: string; name: string | null; email: string | null } | null;
};

export type StockRequestListResponse = {
  items: StockRequestItem[];
  total: number;
  page: number;
  limit: number;
};
