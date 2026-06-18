export function buildErpAdminInvoiceUrl(input: {
  baseUrl: string | null | undefined;
  sourceName: string | null | undefined;
  name: string | null | undefined;
  erpnextInvoiceId: string | null | undefined;
}) {
  const base = input.baseUrl?.replace(/\/$/, "");
  if (!base) return null;
  const isErpSource = input.sourceName?.startsWith("erpnext");
  if (isErpSource && input.name) {
    return `${base}/app/sales-invoice/${encodeURIComponent(input.name)}`;
  }
  if (input.erpnextInvoiceId && !["pending", "pending_approval"].includes(input.erpnextInvoiceId)) {
    return `${base}/app/sales-invoice/${encodeURIComponent(input.erpnextInvoiceId)}`;
  }
  return null;
}
