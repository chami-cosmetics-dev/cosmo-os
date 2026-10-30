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

/** Empty couponCode means "all coupons" — keep the order. */
export function orderMatchesDashboardCoupon(
  order: DashboardCouponOrder,
  couponCode: string | null | undefined,
): boolean {
  const wanted = couponCode?.trim();
  if (!wanted) return true;
  const actual = getDashboardDiscountCoupon(order);
  if (!actual) return false;
  return normalizeDashboardCouponKey(actual) === normalizeDashboardCouponKey(wanted);
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
