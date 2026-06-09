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
    const first = discountCodes[0] as Record<string, unknown>;
    if (typeof first?.code === "string" && first.code.trim()) return first.code.trim();
  }

  return null;
}
