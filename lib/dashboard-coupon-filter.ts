import { getOrderDiscountCouponCode } from "@/lib/order-discount-coupon";

export type DashboardCouponOrder = {
  sourceName?: string | null;
  discountCodes?: unknown;
  rawPayload?: unknown;
};

/** Upper-case key so NG15 and ng15 count as the same coupon. */
export function normalizeDashboardCouponKey(code: string): string {
  return code.trim().toUpperCase();
}

/** Customer discount coupon on the order (COS5, NG15). Not MER / WH tracking codes. */
export function getDashboardDiscountCoupon(order: DashboardCouponOrder): string | null {
  const code = getOrderDiscountCouponCode({
    sourceName: order.sourceName,
    discountCodes: order.discountCodes,
    rawPayload: order.rawPayload,
  });
  const trimmed = code?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeDashboardCouponSelection(
  couponCode: string | readonly string[] | null | undefined,
): string[] {
  const raw = Array.isArray(couponCode) ? couponCode : couponCode ? [couponCode] : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const key = normalizeDashboardCouponKey(String(value));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Empty selection means "all coupons" — keep the order. */
export function orderMatchesDashboardCoupon(
  order: DashboardCouponOrder,
  couponCode: string | readonly string[] | null | undefined,
): boolean {
  const wanted = normalizeDashboardCouponSelection(couponCode);
  if (wanted.length === 0) return true;
  const actual = getDashboardDiscountCoupon(order);
  if (!actual) return false;
  return wanted.includes(normalizeDashboardCouponKey(actual));
}

export function appendDashboardCouponQuery(
  params: URLSearchParams,
  couponCodes: string | readonly string[] | null | undefined,
): void {
  for (const code of normalizeDashboardCouponSelection(couponCodes)) {
    params.append("coupon_code", code);
  }
}

export function formatDashboardCouponFilterLabel(couponCodes: readonly string[]): string {
  if (couponCodes.length === 0) return "All coupons";
  if (couponCodes.length <= 2) return couponCodes.join(", ");
  return `${couponCodes[0]}, ${couponCodes[1]} +${couponCodes.length - 2}`;
}

export function collectDashboardCouponCodes(orders: DashboardCouponOrder[]): string[] {
  const byKey = new Map<string, string>();
  for (const order of orders) {
    const code = getDashboardDiscountCoupon(order);
    if (!code) continue;
    const key = normalizeDashboardCouponKey(code);
    if (!byKey.has(key)) byKey.set(key, key);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}
