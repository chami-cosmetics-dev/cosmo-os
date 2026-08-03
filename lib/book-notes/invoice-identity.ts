const PENDING_INVOICE_IDS = new Set(["pending", "pending_approval"]);

export function resolveBookNoteSalesInvoice(order: {
  erpnextInvoiceId?: string | null;
  name?: string | null;
  orderNumber?: string | null;
  shopifyOrderId?: string | null;
}): string {
  const erp = order.erpnextInvoiceId?.trim();
  if (erp && !PENDING_INVOICE_IDS.has(erp.toLowerCase())) {
    return erp;
  }
  const name = order.name?.trim();
  if (name) return name;
  const orderNumber = order.orderNumber?.trim();
  if (orderNumber) return orderNumber;
  return (order.shopifyOrderId ?? "").trim();
}
