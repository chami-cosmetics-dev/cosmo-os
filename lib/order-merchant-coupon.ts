export function getMerchantCouponCode(params: {
  sourceName: string | null | undefined;
  discountCodes: unknown;
  rawPayload: unknown;
}): string | null {
  const { sourceName, discountCodes, rawPayload } = params;

  if (sourceName === "erpnext" || sourceName === "erpnext-pos") {
    if (rawPayload != null && typeof rawPayload === "object") {
      const p = rawPayload as Record<string, unknown>;
      const code = p.merchant_coupon_code ?? p.custom_merchant_coupon_code;
      if (typeof code === "string" && code.trim()) return code.trim();
    }
    return null;
  }

  if (Array.isArray(discountCodes) && discountCodes.length > 0) {
    const codes = discountCodes
      .map((discount, index) => {
        if (discount == null || typeof discount !== "object") return null;
        const code = (discount as Record<string, unknown>).code;
        if (typeof code !== "string" || !code.trim()) return null;
        return { code: code.trim(), index };
      })
      .filter((code): code is { code: string; index: number } => code != null)
      .sort((a, b) => {
        const aIsMerchant = a.code.toUpperCase().startsWith("MER");
        const bIsMerchant = b.code.toUpperCase().startsWith("MER");
        if (aIsMerchant !== bIsMerchant) return aIsMerchant ? -1 : 1;
        return a.index - b.index;
      })
      .map(({ code }) => code);

    if (codes.length > 0) return codes.join(",");
  }

  return null;
}
