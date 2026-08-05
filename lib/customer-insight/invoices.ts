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
  lineItems?: InvoiceLineDto[];
};

export type AdaptInvoiceInput = {
  id: string;
  invoiceDate: Date;
  salesInvoiceNo: string;
  ttlAmount: number | string;
  currency?: string | null;
  lineItems?: InvoiceLineDto[];
};

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
    includedInLoyaltyTotal: !order.cancelledAt,
    orderId: order.id,
    lineItems: order.lineItems ?? [],
  };
}

export function mapAdaptToInvoiceRow(row: AdaptInvoiceInput): UnifiedInvoiceRowDto {
  return {
    id: `adapt:${row.id}`,
    source: "adapt",
    date: row.invoiceDate.toISOString(),
    reference: row.salesInvoiceNo || row.id,
    secondaryLabel: "Adapt",
    status: "Adapt / —",
    financialStatus: "Adapt",
    fulfillmentStatus: null,
    amount: toAmount(row.ttlAmount),
    currency: row.currency?.trim() || "LKR",
    includedInLoyaltyTotal: true,
    orderId: null,
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
