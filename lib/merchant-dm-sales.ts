import { normalizeMerCodeKey } from "@/lib/merchant-allocation";

/** Cosmetics DM-General tracking code (same bucket as dashboard "DM-General"). */
export const DM_MER_CODE = "MER115";

/**
 * Vault / Supplement Vault ERP Sales Person for direct Shopify (and replace) flow.
 * Same dashboard bucket as MER115 / DM-General.
 */
export const DM_GENERAL_ERP_CODE = "DM_General";

/** Synthetic cohort / peer-board id for DM-General sales (not a User id). */
export const DM_GENERAL_COHORT_ID = "__dm_general__";

export const DM_GENERAL_DISPLAY_NAME = "DM-General";
export const STAFF_SALES_DISPLAY_NAME = "Staff Sales";

/** Staff discount coupons. Orders with these dump as Staff Sales. */
export const STAFF_SALES_COUPON_KEYS = new Set([
  "staffdc",
  "dir100",
  "staffvat",
  "staffsale",
]);

/** Collapse blank / Unknown / Unassigned / "DM General" group label into DM-General. */
export function normalizeDashboardMerchantLabel(
  name: string | null | undefined,
): string {
  const trimmed = name?.trim() || "";
  if (!trimmed) return DM_GENERAL_DISPLAY_NAME;
  const key = trimmed.toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "unknown" || key === "unassigned" || key === "dmgeneral") {
    return DM_GENERAL_DISPLAY_NAME;
  }
  return trimmed;
}

export function isDmCouponCode(code: string | null | undefined): boolean {
  const raw = String(code ?? "").trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower === DM_GENERAL_ERP_CODE.toLowerCase()) return true;
  if (lower.includes("dm") && (lower.includes("general") || lower === "dm")) {
    return true;
  }
  return normalizeMerCodeKey(raw) === DM_MER_CODE;
}

export function normalizeCouponKey(code: string): string {
  return code.trim().toLowerCase();
}

function compactCouponKey(code: string): string {
  return normalizeCouponKey(code).replace(/[_-]+/g, "");
}

export function isStaffSalesCouponCode(code: string | null | undefined): boolean {
  const key = compactCouponKey(String(code ?? ""));
  if (!key) return false;
  return STAFF_SALES_COUPON_KEYS.has(key);
}

/** Merchants who own DM coupon codes (DM-General bucket attributee). */
export function resolveDmHolderMerchantIds(
  merchants: Array<{ id: string }>,
  couponByMerchantId: Map<string, string[]>,
): string[] {
  return merchants
    .filter((m) => splitMerchantCouponSets(couponByMerchantId.get(m.id)).hasDm)
    .map((m) => m.id);
}

/** Share of DM-General bucket sales attributed to one holder (split evenly if multiple). */
export function dmBucketShareForHolder(
  merchantId: string,
  holderIds: string[],
): number {
  if (holderIds.length === 0 || !holderIds.includes(merchantId)) return 0;
  return 1 / holderIds.length;
}

export function resolveFixedSalesCouponBucket(
  couponCodes: string[],
): { id: string | null; name: string } | null {
  if (couponCodes.some((code) => isStaffSalesCouponCode(code))) {
    return { id: null, name: STAFF_SALES_DISPLAY_NAME };
  }
  return null;
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

/**
 * DM-only tracking (ERP DM_General / MER115, no personal MER).
 * Those orders stay in the DM-General bucket — do not assign a person.
 */
export function isDmOnlyMerchantTracking(
  codes: string[] | null | undefined,
): boolean {
  const tracking = (codes ?? []).filter((code) => isMerchantTrackingCode(code));
  return tracking.length > 0 && tracking.every((code) => isDmCouponCode(code));
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
  // Known DM set OR any DM-shaped code (e.g. ERP DM_General not on user couponCodes).
  const dmHit = tracking.some(
    (c) => input.dm.has(c) || (input.hasDm && isDmCouponCode(c)),
  );
  if (merHit) return "mer";
  if (dmHit) return "dm";
  if (tracking.length > 0) return null;
  if (input.hasDm) return "dm";
  if (input.assignedToViewer) return "mer";
  return null;
}

/**
 * Cohort attribution for peer graphs.
 * Personal MER → merchant user id.
 * DM-shaped codes (MER115 / ERP DM_General) → synthetic DM-General when a holder
 * exists; otherwise omit (never credit assignedMerchantId).
 * No merchant tracking code → DM-General only when a DM holder exists.
 */
export function resolveCohortMerchantId(input: {
  orderCoupons: string[];
  couponToMerchantId: Map<string, string>;
  assignedMerchantId: string | null | undefined;
  cohortIds: Set<string>;
  /** Synthetic bucket id (e.g. DM_GENERAL_COHORT_ID) when company has a DM holder. */
  dmBucketId: string | null;
}): string | null {
  const tracking = input.orderCoupons.filter((c) => isMerchantTrackingCode(c));
  for (const code of tracking) {
    const hit = input.couponToMerchantId.get(code);
    if (hit) return hit;
  }
  // ERP DM_General (etc.) may not be on any Vault user couponCodes.
  // Never fall through to assignedMerchantId — DM-General stays unassigned.
  if (tracking.some((c) => isDmCouponCode(c))) {
    return input.dmBucketId;
  }
  if (tracking.length === 0 && input.dmBucketId) {
    return input.dmBucketId;
  }
  if (
    input.assignedMerchantId &&
    input.cohortIds.has(input.assignedMerchantId)
  ) {
    return input.assignedMerchantId;
  }
  return null;
}
