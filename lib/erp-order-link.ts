/** True when the order has a real ERP Sales Invoice linked (not a placeholder). */
export function isLinkedErpSalesInvoiceId(erpnextInvoiceId?: string | null): boolean {
  const trimmed = erpnextInvoiceId?.trim();
  if (!trimmed || trimmed === "pending_approval") return false;
  return true;
}

export function shouldResolveFromLinkedErpInvoice(input: {
  sourceName?: string | null;
  erpnextInvoiceId?: string | null;
}): boolean {
  const source = input.sourceName?.toLowerCase() ?? "";
  if (source.startsWith("erpnext")) return true;
  return isLinkedErpSalesInvoiceId(input.erpnextInvoiceId);
}
