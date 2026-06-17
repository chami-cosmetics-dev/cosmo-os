export function getMerchantCouponCode(params: {
  sourceName: string | null | undefined;
  discountCodes: unknown;
  rawPayload: unknown;
  assignedMerchantCouponCodes?: string[] | null;
}): string | null {
  const { sourceName, discountCodes, rawPayload, assignedMerchantCouponCodes } = params;

  if (sourceName === "erpnext" || sourceName === "erpnext-pos") {
    if (rawPayload != null && typeof rawPayload === "object") {
      const p = rawPayload as Record<string, unknown>;
      // ERP can send payload at root level OR nested under a "data" key — check both
      const payload =
        p.data != null && typeof p.data === "object" && !Array.isArray(p.data)
          ? (p.data as Record<string, unknown>)
          : p;
      const code = payload.merchant_coupon_code ?? payload.custom_merchant_coupon_code;
      if (typeof code === "string" && code.trim()) return code.trim();
    }
    // ERP inbound webhook stores the coupon in discountCodes — use it as fallback
    if (Array.isArray(discountCodes) && discountCodes.length > 0) {
      const first = discountCodes[0] as Record<string, unknown>;
      if (typeof first?.code === "string" && first.code.trim()) return first.code.trim();
    }
    // Last resort: if the merchant was assigned (e.g. via ERP owner field) but no coupon
    // code was in the payload, show the merchant's own registered coupon code
    if (assignedMerchantCouponCodes) {
      const first = assignedMerchantCouponCodes.find((c) => c?.trim());
      if (first) return first.trim();
    }
    return null;
  }

  if (Array.isArray(discountCodes) && discountCodes.length > 0) {
    const codes = discountCodes as Array<Record<string, unknown>>;
    // When multiple discount codes are present (e.g. site discount + merchant tracking code),
    // prefer the merchant tracking code. Identify it by:
    //   1. Code starting with "MER" (system-wide merchant code convention)
    //   2. Code with amount "0.00" / 0 (tracking codes carry no monetary discount)
    if (codes.length > 1) {
      const merCode = codes.find((d) => {
        const c = typeof d?.code === "string" ? d.code.trim() : "";
        return c.toUpperCase().startsWith("MER");
      });
      if (merCode && typeof merCode.code === "string" && merCode.code.trim()) {
        return merCode.code.trim();
      }
      const zeroCode = codes.find((d) => {
        const amt = d?.amount;
        return (typeof amt === "string" && parseFloat(amt) === 0) ||
               (typeof amt === "number" && amt === 0);
      });
      if (zeroCode && typeof zeroCode.code === "string" && zeroCode.code.trim()) {
        return zeroCode.code.trim();
      }
    }
    const first = codes[0];
    if (typeof first?.code === "string" && first.code.trim()) return first.code.trim();
  }

  // For non-ERP orders (Shopify POS, etc.) where merchant is assigned by user_id not coupon:
  // fall back to the merchant's own registered coupon code
  if (assignedMerchantCouponCodes) {
    const first = assignedMerchantCouponCodes.find((c) => c?.trim());
    if (first) return first.trim();
  }

  return null;
}
