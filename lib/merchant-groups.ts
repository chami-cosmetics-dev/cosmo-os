import { normalizeMerCodeKey } from "@/lib/merchant-allocation";
import {
  DM_GENERAL_DISPLAY_NAME,
  isDmCouponCode,
  isMerchantTrackingCode,
  resolveFixedSalesCouponBucket,
  normalizeDashboardMerchantLabel,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";
import { isWholesaleTrackingCode } from "@/lib/merchant-wholesale";

export type MerchantUser = {
  id: string;
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
  couponCodes: string[];
};

export type MerchantOption = MerchantUser & {
  displayName: string;
  groupId: string | null;
  groupName: string | null;
};

export type MerchantGroupWithMembers = {
  id: string;
  name: string;
  members: MerchantOption[];
};

export function supportsMerchantGroups(): boolean {
  return false;
}

export function getMerchantDisplayName(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
  id?: string | null;
} | null | undefined) {
  return user?.knownName?.trim() || user?.name?.trim() || user?.email?.trim() || user?.id?.trim() || "Unknown";
}

export async function getMerchantGroupUserMap(companyId: string): Promise<Map<string, { id: string; name: string }>> {
  void companyId;
  return new Map();
}

export function applyMerchantGroup(
  merchant: { id: string | null; name: string },
  userToGroup: Map<string, { id: string; name: string }>,
) {
  void userToGroup;
  return {
    id: merchant.id,
    name: normalizeDashboardMerchantLabel(merchant.name),
  };
}

export function buildCouponToMerchantMap(
  users: MerchantUser[],
  userToGroup: Map<string, { id: string; name: string }> = new Map(),
) {
  const couponToMerchant = new Map<string, { id: string | null; name: string }>();
  for (const user of users) {
    const merchant = applyMerchantGroup(
      {
        id: user.id,
        name: normalizeDashboardMerchantLabel(getMerchantDisplayName(user)),
      },
      userToGroup,
    );
    merchant.name = normalizeDashboardMerchantLabel(merchant.name);
    for (const coupon of user.couponCodes) {
      if (isWholesaleTrackingCode(coupon)) continue;
      const normalized = coupon.trim().toLowerCase();
      if (!normalized) continue;
      const merKey = normalizeMerCodeKey(coupon)?.toLowerCase() ?? null;
      if (isDmCouponCode(coupon)) {
        const dmHit = { id: null, name: DM_GENERAL_DISPLAY_NAME };
        couponToMerchant.set(normalized, dmHit);
        // Also index MER## so "MER115 - DMG" and "MER115" share the DM bucket.
        if (merKey && !couponToMerchant.has(merKey)) {
          couponToMerchant.set(merKey, dmHit);
        }
        continue;
      }
      if (!couponToMerchant.has(normalized)) {
        couponToMerchant.set(normalized, merchant);
      }
      // ERP often sends "MER116 - Imandi"; user may only store "MER116".
      if (merKey && !couponToMerchant.has(merKey)) {
        couponToMerchant.set(merKey, merchant);
      }
    }
  }
  return couponToMerchant;
}

export function matchMerchantFromCouponMap(
  merchantCoupons: string[],
  couponToMerchant: Map<string, { id: string | null; name: string }>,
): { id: string | null; name: string } | null {
  const fixedBucket = resolveFixedSalesCouponBucket(merchantCoupons);
  if (fixedBucket) return fixedBucket;

  let dmMatch: { id: string | null; name: string } | null = null;
  for (const code of merchantCoupons) {
    const trimmed = code.trim();
    const exactKey = trimmed.toLowerCase();
    const merKey = normalizeMerCodeKey(trimmed)?.toLowerCase() ?? null;
    const hit =
      couponToMerchant.get(exactKey) ??
      (merKey ? couponToMerchant.get(merKey) : undefined);
    if (!hit) {
      // Vault ERP Sales Person DM_General may not be on any user couponCodes.
      if (isDmCouponCode(trimmed)) {
        dmMatch ??= { id: null, name: DM_GENERAL_DISPLAY_NAME };
      }
      continue;
    }
    const name = normalizeDashboardMerchantLabel(hit.name);
    if (name === DM_GENERAL_DISPLAY_NAME) {
      dmMatch ??= { id: null, name: DM_GENERAL_DISPLAY_NAME };
      continue;
    }
    return { id: hit.id, name };
  }
  return dmMatch;
}

export function resolveAssignedMerchantDashboardFallback(input: {
  assignedMerchantId: string | null | undefined;
  assignedMerchant: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
  } | null;
  orderCoupons: string[];
  userToGroup: Map<string, { id: string; name: string }>;
}): { id: string | null; name: string } {
  const sets = splitMerchantCouponSets(input.assignedMerchant?.couponCodes);
  const tracking = input.orderCoupons
    .map((c) => c.trim().toLowerCase())
    .filter((c) => isMerchantTrackingCode(c));
  const personalHit = tracking.some((c) => {
    if (sets.personal.has(c)) return true;
    const merKey = normalizeMerCodeKey(c)?.toLowerCase();
    return Boolean(merKey && sets.personal.has(merKey));
  });
  if (!personalHit && tracking.some((c) => isDmCouponCode(c))) {
    return { id: null, name: DM_GENERAL_DISPLAY_NAME };
  }
  if (sets.hasDm && !personalHit) {
    return { id: null, name: DM_GENERAL_DISPLAY_NAME };
  }
  const grouped = applyMerchantGroup(
    {
      id: input.assignedMerchantId ?? null,
      name: normalizeDashboardMerchantLabel(
        getMerchantDisplayName(input.assignedMerchant),
      ),
    },
    input.userToGroup,
  );
  return {
    id: grouped.id,
    name: normalizeDashboardMerchantLabel(grouped.name),
  };
}
