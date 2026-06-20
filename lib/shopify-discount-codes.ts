export type ParsedShopifyDiscountCode = {
  code: string;
  amount: number;
};

function parseDiscountAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Normalize Shopify `discount_codes` rows from webhook or stored JSON. */
export function parseShopifyDiscountCodes(discountCodes: unknown): ParsedShopifyDiscountCode[] {
  if (!Array.isArray(discountCodes)) return [];
  const out: ParsedShopifyDiscountCode[] = [];
  for (const row of discountCodes) {
    if (row == null || typeof row !== "object") continue;
    const raw = row as Record<string, unknown>;
    const code =
      typeof raw.code === "string"
        ? raw.code.trim()
        : raw.code != null
          ? String(raw.code).trim()
          : "";
    if (!code || code.toLowerCase() === "shopify") continue;
    out.push({ code, amount: parseDiscountAmount(raw.amount) });
  }
  return out;
}

/** MER / zero-amount codes are merchant tracking only — not monetary discounts. */
export function isMerchantTrackingDiscountCode(entry: ParsedShopifyDiscountCode): boolean {
  if (entry.code.toUpperCase().startsWith("MER")) return true;
  return entry.amount === 0;
}

function isMerchantTrackingRow(row: Record<string, unknown>): boolean {
  const code =
    typeof row.code === "string"
      ? row.code.trim()
      : row.code != null
        ? String(row.code).trim()
        : "";
  if (!code || code.toLowerCase() === "shopify") return false;
  return isMerchantTrackingDiscountCode({
    code,
    amount: parseDiscountAmount(row.amount),
  });
}

/** Discount coupon that actually reduced the order (e.g. SV20). */
export function getDiscountCouponCode(discountCodes: unknown): string | null {
  const parsed = parseShopifyDiscountCodes(discountCodes);

  // Non-MER codes (SV20, etc.) are real discounts — prefer even when Shopify reports amount on MER row.
  const nonMer = parsed.filter((entry) => !entry.code.toUpperCase().startsWith("MER"));
  if (nonMer.length > 0) {
    const paying = nonMer.filter((entry) => entry.amount > 0).sort((a, b) => b.amount - a.amount);
    if (paying.length > 0) return paying[0].code;
    return nonMer[0].code;
  }

  const paying = parsed
    .filter((entry) => !isMerchantTrackingDiscountCode(entry) && entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  if (paying.length > 0) return paying[0].code;

  const nonMerchant = parsed.filter((entry) => !isMerchantTrackingDiscountCode(entry));
  if (nonMerchant.length > 0) return nonMerchant[0].code;

  return null;
}

export function splitShopifyDiscountCodes(discountCodes: unknown): {
  merchantCode: string | null;
  discountCode: string | null;
} {
  const parsed = parseShopifyDiscountCodes(discountCodes);
  const merchantRows = parsed.filter(isMerchantTrackingDiscountCode);
  const merPref = merchantRows.find((e) => e.code.toUpperCase().startsWith("MER"));
  return {
    merchantCode: merPref?.code ?? merchantRows[0]?.code ?? null,
    discountCode: getDiscountCouponCode(discountCodes),
  };
}

export { isMerchantTrackingRow };
