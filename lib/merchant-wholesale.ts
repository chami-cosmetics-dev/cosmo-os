/**
 * Wholesale MER codes use WH## prefix (e.g. WH56).
 * Orders with these codes are wholesale SI — separate targets and dashboard tracking.
 */

export const ERP_WHOLESALE_CUSTOMER_GROUP = "Wholesale";

export function normalizeWholesaleMerCodeKey(
  code: string | null | undefined,
): string | null {
  const raw = String(code ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^WH\s*(\d+)/i);
  if (!m) return null;
  return `WH${m[1]}`;
}

export function isWholesaleTrackingCode(code: string | null | undefined): boolean {
  return normalizeWholesaleMerCodeKey(code) != null;
}

function normalizeWholesaleCouponKey(code: string): string {
  return code.trim().toLowerCase();
}

/** Keys for matching order WH codes to a user's wholesaleCouponCodes. */
export function wholesaleMatchKeysFromCouponCodes(
  couponCodes: string[] | null | undefined,
): string[] {
  const out = new Set<string>();
  for (const code of couponCodes ?? []) {
    const trimmed = String(code ?? "").trim();
    if (!trimmed) continue;
    out.add(trimmed);
    out.add(normalizeWholesaleCouponKey(trimmed));
    const key = normalizeWholesaleMerCodeKey(trimmed);
    if (key) {
      out.add(key);
      out.add(key.toLowerCase());
    }
  }
  return [...out];
}

export function buildWholesaleCouponSet(
  couponCodes: string[] | null | undefined,
): Set<string> {
  return new Set(wholesaleMatchKeysFromCouponCodes(couponCodes).map((k) => k.toLowerCase()));
}

export function orderWholesaleTrackingCoupons(orderCoupons: string[]): string[] {
  return orderCoupons.filter((c) => isWholesaleTrackingCode(c));
}

export function orderIsWholesale(orderCoupons: string[]): boolean {
  return orderWholesaleTrackingCoupons(orderCoupons).length > 0;
}

/** True when this merchant owns a WH code on the order. */
export function wholesaleMerchantMatchesOrder(
  orderCoupons: string[],
  wholesaleCodes: Set<string>,
): boolean {
  for (const code of orderWholesaleTrackingCoupons(orderCoupons)) {
    const trimmed = code.trim().toLowerCase();
    if (wholesaleCodes.has(trimmed)) return true;
    const key = normalizeWholesaleMerCodeKey(code);
    if (key && wholesaleCodes.has(key.toLowerCase())) return true;
  }
  return false;
}
