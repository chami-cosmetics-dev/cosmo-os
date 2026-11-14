import { formatAppDateTime } from "@/lib/format-datetime";
import {
  STOCK_LOOKUP_STATUS_LABELS,
  STOCK_REQUEST_STATUS_LABELS,
} from "@/lib/wishlist-buddy/constants";
import type { StockRequestItem } from "@/lib/wishlist-buddy/types";

export const STOCK_REQUEST_EXPORT_HEADERS = [
  "Created at",
  "Status",
  "Source",
  "Created by",
  "Customer name",
  "Phone",
  "Email",
  "Product",
  "Variant",
  "SKU",
  "Product URL",
  "Stock",
  "Warehouses with stock",
  "Sold from",
  "Remark",
  "Back in stock at",
  "Back in stock warehouse",
  "Awaiting stock",
  "Last updated at",
  "Last updated by",
  "Availability email sent",
  "Back-in-stock email sent",
] as const;

export type StockRequestExportRow = Record<(typeof STOCK_REQUEST_EXPORT_HEADERS)[number], string>;

function sourceLabel(source: string): string {
  if (source === "import") return "Imported";
  if (source === "staff") return "Staff";
  return "Website";
}

function personLabel(person: { name: string | null; email: string | null } | null): string {
  return person?.name || person?.email || "";
}

function qty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function stockRequestExportRow(item: StockRequestItem): StockRequestExportRow {
  return {
    "Created at": formatAppDateTime(item.createdAt),
    Status: STOCK_REQUEST_STATUS_LABELS[item.status],
    Source: sourceLabel(item.source),
    "Created by": personLabel(item.createdBy),
    "Customer name": item.customerName,
    Phone: item.customerPhone ?? "",
    Email: item.customerEmail ?? "",
    Product: item.productTitle,
    Variant: item.variantTitle ?? "",
    SKU: item.sku ?? "",
    "Product URL": item.productUrl ?? "",
    Stock: STOCK_LOOKUP_STATUS_LABELS[item.stockLookupStatus],
    "Warehouses with stock": item.stockSources
      .map((source) => `${source.warehouse} (${qty(source.availableQty)})`)
      .join("; "),
    "Sold from": item.soldFromWarehouse ?? "",
    Remark: item.remark ?? "",
    "Back in stock at": formatAppDateTime(item.restockedAt, ""),
    "Back in stock warehouse": item.restockedWarehouse ?? "",
    "Awaiting stock": item.awaitingStock ? "Yes" : "",
    "Last updated at": formatAppDateTime(item.lastActionAt, ""),
    "Last updated by": personLabel(item.lastActionBy),
    "Availability email sent": formatAppDateTime(item.availabilityEmailSentAt, ""),
    "Back-in-stock email sent": formatAppDateTime(item.restockEmailSentAt, ""),
  };
}
