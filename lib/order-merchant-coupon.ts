import { isMerchantTrackingRow } from "@/lib/shopify-discount-codes";

export function getMerchantCouponCode(params: {
  sourceName: string | null | undefined;
  discountCodes: unknown;
  rawPayload: unknown;
  assignedMerchantCouponCodes?: string[] | null;
  /** When true, return all discount codes comma-separated (dump 2 report). Default: single preferred merchant code. */
  joinAllDiscountCodes?: boolean;
}): string | null {
  const {
    sourceName,
    discountCodes,
    rawPayload,
    assignedMerchantCouponCodes,
    joinAllDiscountCodes = false,
  } = params;

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
    if (joinAllDiscountCodes) {
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
    } else {
      const codes = discountCodes as Array<Record<string, unknown>>;
      const merchantOnly = codes.filter(isMerchantTrackingRow);
      if (merchantOnly.length > 0) {
        const merCode = merchantOnly.find((d) => {
          const c = typeof d?.code === "string" ? d.code.trim() : "";
          return c.toUpperCase().startsWith("MER");
        });
        if (merCode && typeof merCode.code === "string" && merCode.code.trim()) {
          return merCode.code.trim();
        }
        const first = merchantOnly[0];
        if (typeof first?.code === "string" && first.code.trim()) return first.code.trim();
      }
    }
  }

  // For non-ERP orders (Shopify POS, etc.) where merchant is assigned by user_id not coupon:
  // fall back to the merchant's own registered coupon code
  if (assignedMerchantCouponCodes) {
    const first = assignedMerchantCouponCodes.find((c) => c?.trim());
    if (first) return first.trim();
  }

  return null;
}

/** Display label for merchant column: assigned user name/email, else MER coupon code. */
export function resolveOrderMerchantLabel(params: {
  assignedMerchant?: { name: string | null; email: string | null } | null;
  sourceName?: string | null;
  discountCodes?: unknown;
  rawPayload?: unknown;
  assignedMerchantCouponCodes?: string[] | null;
}): string | null {
  const assigned =
    params.assignedMerchant?.name?.trim() || params.assignedMerchant?.email?.trim() || null;
  if (assigned) return assigned;

  return getMerchantCouponCode({
    sourceName: params.sourceName ?? null,
    discountCodes: params.discountCodes,
    rawPayload: params.rawPayload ?? null,
    assignedMerchantCouponCodes: params.assignedMerchantCouponCodes ?? null,
  });
}
