/** Shopify REST cancel_reason values, plus reasons we write from webhooks. */
const SHOPIFY_CANCEL_REASONS = new Set([
  "customer",
  "fraud",
  "inventory",
  "declined",
  "other",
  "staff",
  "cancelled in shopify",
  "refunded in shopify",
]);

export function isShopifyDrivenCancel(
  cancelReason: string | null | undefined,
): boolean {
  const reason = cancelReason?.trim().toLowerCase() ?? "";
  if (!reason) return false;
  if (reason.includes("shopify")) return true;
  return SHOPIFY_CANCEL_REASONS.has(reason);
}

/** OS user name/email, else Shopify when the void came from Shopify, else ERP. */
export function resolveOrderCancelledByLabel(
  cancelledBy: { name?: string | null; email?: string | null } | null | undefined,
  cancelReason?: string | null,
): string {
  const name = cancelledBy?.name?.trim();
  if (name) return name;
  const email = cancelledBy?.email?.trim();
  if (email) return email;
  if (isShopifyDrivenCancel(cancelReason)) return "Shopify";
  return "ERP";
}
