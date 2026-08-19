import { normalizeMerCodeKey } from "@/lib/merchant-allocation";

/** Company DM-General tracking code (same bucket as dashboard "DM-General"). */
export const DM_MER_CODE = "MER115";

export function isDmCouponCode(code: string | null | undefined): boolean {
  const raw = String(code ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower.includes("dm") && (lower.includes("general") || lower === "dm")) {
    return true;
  }
  return normalizeMerCodeKey(raw) === DM_MER_CODE;
}

export function normalizeCouponKey(code: string): string {
  return code.trim().toLowerCase();
}

export function splitMerchantCouponSets(couponCodes: string[] | null | undefined): {
  personal: Set<string>;
  dm: Set<string>;
  hasDm: boolean;
} {
  const personal = new Set<string>();
  const dm = new Set<string>();
  for (const code of couponCodes ?? []) {
    const key = normalizeCouponKey(code);
    if (!key) continue;
    if (isDmCouponCode(code)) dm.add(key);
    else personal.add(key);
  }
  return { personal, dm, hasDm: dm.size > 0 };
}

/** True when a discount/coupon string is a merchant tracking code (MER## or DM). */
export function isMerchantTrackingCode(code: string): boolean {
  if (isDmCouponCode(code)) return true;
  return normalizeMerCodeKey(code) != null;
}

export function parseOrderCouponList(merchantCouponCode: string | null | undefined): string[] {
  return (merchantCouponCode ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

export type MerchantSalesBucket = "mer" | "dm";

/**
 * Classify one order for a viewed merchant.
 * Personal MER codes → mer.
 * DM codes → dm.
 * No merchant tracking code on the order → dm when this user owns DM; else mer if assigned to them.
 */
export function classifyMerchantSalesBucket(input: {
  orderCoupons: string[];
  personal: Set<string>;
  dm: Set<string>;
  hasDm: boolean;
  assignedToViewer: boolean;
}): MerchantSalesBucket | null {
  const tracking = input.orderCoupons.filter((c) => isMerchantTrackingCode(c));
  const merHit = tracking.some((c) => input.personal.has(c));
  const dmHit = tracking.some((c) => input.dm.has(c));
  if (merHit) return "mer";
  if (dmHit) return "dm";
  if (tracking.length > 0) return null;
  if (input.hasDm) return "dm";
  if (input.assignedToViewer) return "mer";
  return null;
}

/** Cohort: first merchant matching a tracking code, else DM owner when order has no MER. */
export function resolveCohortMerchantId(input: {
  orderCoupons: string[];
  couponToMerchantId: Map<string, string>;
  assignedMerchantId: string | null | undefined;
  cohortIds: Set<string>;
  dmMerchantId: string | null;
}): string | null {
  const tracking = input.orderCoupons.filter((c) => isMerchantTrackingCode(c));
  for (const code of tracking) {
    const hit = input.couponToMerchantId.get(code);
    if (hit) return hit;
  }
  if (tracking.length === 0 && input.dmMerchantId) {
    return input.dmMerchantId;
  }
  if (
    input.assignedMerchantId &&
    input.cohortIds.has(input.assignedMerchantId)
  ) {
    return input.assignedMerchantId;
  }
  return null;
}
