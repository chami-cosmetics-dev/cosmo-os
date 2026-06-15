export type SmsTrigger =
  | "order_received"
  | "package_ready"
  | "dispatched"
  | "rider_dispatched"
  | "delivery_complete";

export type SmsContext = {
  orderNumber?: string;
  orderName?: string;
  invoiceNumber?: string;
  customerName?: string;
  customerPhone?: string;
  locationName?: string;
  deliveryUrl?: string;
  riderName?: string;
  riderPhone?: string;
};

/** ERP Sales Invoice name only (erpnextInvoiceId). Never Shopify order id. */
export function resolveOrderInvoiceNumber(order: {
  erpnextInvoiceId?: string | null;
}): string {
  const erp = order.erpnextInvoiceId?.trim();
  if (!erp || erp === "pending" || erp === "pending_approval") return "";
  return erp;
}

export function resolveOrderNumber(order: {
  name?: string | null;
  orderNumber?: string | null;
  shopifyOrderId?: string | null;
}): string {
  return order.name?.trim() || order.orderNumber?.trim() || order.shopifyOrderId?.trim() || "";
}

/** Customer phone from order field, shipping address, or billing address. */
export function resolveCustomerPhone(order: {
  customerPhone?: string | null;
  shippingAddress?: unknown;
  billingAddress?: unknown;
}): string | undefined {
  const direct = order.customerPhone?.trim();
  if (direct) return direct;

  for (const addr of [order.shippingAddress, order.billingAddress]) {
    const record = addr as Record<string, string> | null | undefined;
    const phone = record?.phone?.trim();
    if (phone) return phone;
  }

  return undefined;
}

export function getDeliveryUrl(order: { riderDeliveryToken: string | null }): string {
  if (!order.riderDeliveryToken) return "";
  const base = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
  const protocol = base.startsWith("http") ? "" : "https://";
  return `${protocol}${base}/r/d/${order.riderDeliveryToken}`;
}
