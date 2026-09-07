const LOCAL_PAID_STATUSES = new Set(["paid", "partially_paid"]);
const SHOPIFY_UNPAID_STATUSES = new Set(["", "pending", "authorized"]);

export function isShopifyOrderFullyRefunded(
  financialStatus: string | null | undefined,
): boolean {
  return financialStatus?.trim().toLowerCase() === "refunded";
}

export function shouldVoidShopifyOrder(input: {
  financialStatus?: string | null;
  cancelledAt?: string | null;
  totalPriceIsNegative?: boolean;
}): boolean {
  const status = input.financialStatus?.trim().toLowerCase();
  return (
    Boolean(input.cancelledAt?.trim()) ||
    status === "voided" ||
    status === "refunded" ||
    input.totalPriceIsNegative === true
  );
}

/**
 * Shopify COD/Cash stays `pending` even after ERP records a Payment Entry.
 * Do not let that unpaid Shopify value clobber a local paid status.
 */
export function resolveShopifyWebhookFinancialStatus(input: {
  existingStatus?: string | null;
  incomingStatus?: string | null;
  invoiceCompleteAt?: Date | null;
  shouldVoid: boolean;
}): string | null {
  if (input.shouldVoid) return "voided";

  const existing = input.existingStatus?.trim().toLowerCase() ?? "";
  if (existing === "voided") return "voided";

  const incomingRaw = input.incomingStatus?.trim() ?? "";
  const incoming = incomingRaw.toLowerCase();
  const shopifyLooksUnpaid = SHOPIFY_UNPAID_STATUSES.has(incoming);

  if (shopifyLooksUnpaid) {
    if (LOCAL_PAID_STATUSES.has(existing)) return existing;
    if (input.invoiceCompleteAt) return "paid";
  }

  return incomingRaw.slice(0, 50) || null;
}
