/** Replace {{placeholder}} tokens. Unknown keys left as-is. */
export function renderSmsTemplatePlaceholders(
  text: string,
  data: Record<string, string | number>,
): string {
  return text.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return full;
    return String(data[key]);
  });
}

export type LoyaltyWishPlaceholderVars = {
  customerName: string;
  tier: string;
  discountPercent: string | number;
  merchantName: string;
  merchantPhone: string;
  officePhone: string;
};

export function buildLoyaltyWishPlaceholderVars(
  input: LoyaltyWishPlaceholderVars,
): Record<string, string> {
  return {
    customerName: input.customerName.trim() || "Customer",
    tier: input.tier.trim(),
    discountPercent: String(input.discountPercent),
    merchantName: input.merchantName.trim(),
    merchantPhone: input.merchantPhone.trim(),
    officePhone: input.officePhone.trim(),
  };
}
