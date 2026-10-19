import {
  isAdaptAmountExcludedFromSaleTotal,
  isOrderIncludedInCustomerLifetimeTotal,
} from "@/lib/customer-insight/lifetime-total";
import type { InvoiceLineDto, UnifiedInvoiceRowDto } from "@/lib/customer-insight/types";

export type OrderInvoiceInput = {
  id: string;
  createdAt: Date;
  orderNumber: string | null;
  name: string | null;
  erpnextInvoiceId: string | null;
  totalPrice: number | string;
  currency?: string | null;
  cancelledAt: Date | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  fulfillmentStage?: string | null;
  locationName?: string | null;
  discountCouponCode?: string | null;
  merchantCouponCode?: string | null;
  merchantName?: string | null;
  lineItems?: InvoiceLineDto[];
};

export type AdaptInvoiceInput = {
  id: string;
  invoiceDate: Date;
  salesInvoiceNo: string;
  ttlAmount: number | string;
  currency?: string | null;
  locationName?: string | null;
  merchantName?: string | null;
  paymentMethod?: string | null;
  /** `adapt`, `vault_supplement_import` (Cosmo OS transfer), or `vault_file_import`. */
  origin?: string | null;
  /** File-import batches are `vsupp-<time>`. Cosmo OS transfer batches are `vsupp-direct-<time>`. */
  importBatchId?: string | null;
  /** File status such as paid, voided, refunded. */
  financialStatus?: string | null;
  lineItems?: InvoiceLineDto[];
};

export type PurchaseHistoryOrigin = "adapt" | "vault_supplement_import" | "vault_file_import";

/** Finance-file rows written before `vault_file_import` still use a `vsupp-` batch id. */
export function normalizePurchaseOrigin(
  origin: string | null | undefined,
  importBatchId?: string | null,
): PurchaseHistoryOrigin {
  if (origin === "vault_file_import") return "vault_file_import";
  if (origin === "vault_supplement_import") {
    const batch = importBatchId?.trim() ?? "";
    if (batch.startsWith("vsupp-") && !batch.startsWith("vsupp-direct-")) return "vault_file_import";
    return "vault_supplement_import";
  }
  return "adapt";
}

/** Cosmetics = transferred from Cosmo OS. File import = finance workbook. Supplement = Vault OS order or older Adapt. */
export function isImportedPurchaseOrigin(
  origin: string | null | undefined,
): origin is "vault_supplement_import" | "vault_file_import" {
  return origin === "vault_supplement_import" || origin === "vault_file_import";
}

export function saleBusinessLabel(
  origin: string | null | undefined,
  importBatchId?: string | null,
): "Cosmetics" | "Supplement" | "File import" {
  const normalized = normalizePurchaseOrigin(origin, importBatchId);
  if (normalized === "vault_file_import") return "File import";
  if (normalized === "vault_supplement_import") return "Cosmetics";
  return "Supplement";
}

function toAmount(value: number | string): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function orderReference(order: OrderInvoiceInput): string {
  const erp = order.erpnextInvoiceId?.trim();
  if (erp && erp !== "pending" && erp !== "pending_approval") return erp;
  if (order.orderNumber?.trim()) return order.orderNumber.trim();
  if (order.name?.trim()) return order.name.trim();
  return order.id;
}

export function mapOrderToInvoiceRow(order: OrderInvoiceInput): UnifiedInvoiceRowDto {
  return {
    id: `order:${order.id}`,
    source: "order",
    date: order.createdAt.toISOString(),
    reference: orderReference(order),
    secondaryLabel: order.orderNumber?.trim() || null,
    status: order.cancelledAt
      ? "cancelled"
      : `${order.financialStatus ?? "N/A"} / ${order.fulfillmentStatus ?? "N/A"}`,
    financialStatus: order.cancelledAt ? "cancelled" : order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    amount: toAmount(order.totalPrice),
    currency: order.currency?.trim() || "LKR",
    includedInLoyaltyTotal: isOrderIncludedInCustomerLifetimeTotal({
      cancelledAt: order.cancelledAt,
      financialStatus: order.financialStatus,
      fulfillmentStage: order.fulfillmentStage,
    }),
    orderId: order.id,
    locationName: order.locationName?.trim() || null,
    discountCouponCode: order.discountCouponCode?.trim() || null,
    merchantCouponCode: order.merchantCouponCode?.trim() || null,
    merchantName: order.merchantName?.trim() || null,
    lineItems: order.lineItems ?? [],
  };
}

export function mapAdaptToInvoiceRow(row: AdaptInvoiceInput): UnifiedInvoiceRowDto {
  const origin = normalizePurchaseOrigin(row.origin, row.importBatchId);
  const imported = origin === "vault_supplement_import" || origin === "vault_file_import";
  const fileStatus = row.financialStatus?.trim() || "";
  const payment = row.paymentMethod?.trim() || "";
  const statusText = imported ? fileStatus || payment || "Imported" : fileStatus || "Adapt";
  return {
    id: `adapt:${row.id}`,
    source: "adapt",
    date: row.invoiceDate.toISOString(),
    reference: row.salesInvoiceNo || row.id,
    secondaryLabel:
      origin === "vault_file_import"
        ? "File import"
        : origin === "vault_supplement_import"
          ? "Supplement import"
          : "Adapt",
    status: imported ? statusText : "Adapt / —",
    financialStatus: statusText,
    fulfillmentStatus: null,
    origin,
    amount: toAmount(row.ttlAmount),
    currency: row.currency?.trim() || "LKR",
    includedInLoyaltyTotal: !isAdaptAmountExcludedFromSaleTotal(row.financialStatus),
    orderId: null,
    locationName: row.locationName?.trim() || null,
    discountCouponCode: null,
    merchantCouponCode: null,
    merchantName: row.merchantName?.trim() || null,
    lineItems: row.lineItems ?? [],
  };
}

/** Merge Cosmo + Adapt invoices, newest first, then page. */
export function mergeAndPaginateInvoices(input: {
  orders: OrderInvoiceInput[];
  adaptRows: AdaptInvoiceInput[];
  page: number;
  pageSize: number;
}): {
  invoices: UnifiedInvoiceRowDto[];
  total: number;
  page: number;
  pageSize: number;
} {
  const merged = [
    ...input.orders.map(mapOrderToInvoiceRow),
    ...input.adaptRows.map(mapAdaptToInvoiceRow),
  ].sort((a, b) => {
    const ta = new Date(a.date).getTime();
    const tb = new Date(b.date).getTime();
    return tb - ta;
  });

  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, input.pageSize);
  const start = (page - 1) * pageSize;

  return {
    invoices: merged.slice(start, start + pageSize),
    total: merged.length,
    page,
    pageSize,
  };
}

/** Display label used for top-item aggregation / filter matching. */
export function invoiceLineDisplayName(item: InvoiceLineDto): string {
  const title = item.productTitle?.trim() || "Unknown item";
  const variant = item.variantTitle?.trim();
  if (variant && variant.toLowerCase() !== "default title") {
    return `${title} — ${variant}`;
  }
  return title;
}

/** Compact coupon label for Insight / merchant tables. */
export function formatInvoiceCouponLabel(input: {
  discountCouponCode?: string | null;
  merchantCouponCode?: string | null;
}): string | null {
  const parts = [input.discountCouponCode, input.merchantCouponCode]
    .map((c) => c?.trim())
    .filter((c): c is string => Boolean(c));
  if (parts.length === 0) return null;
  return [...new Set(parts)].join(" · ");
}
