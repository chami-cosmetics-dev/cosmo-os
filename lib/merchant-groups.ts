import {
  DM_GENERAL_DISPLAY_NAME,
  isDmCouponCode,
  isMerchantTrackingCode,
  resolveFixedSalesCouponBucket,
  normalizeDashboardMerchantLabel,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";

type MerchantUser = {
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
      const normalized = coupon.trim().toLowerCase();
      if (!normalized) continue;
      if (isDmCouponCode(coupon)) {
        couponToMerchant.set(normalized, {
          id: null,
          name: DM_GENERAL_DISPLAY_NAME,
        });
        continue;
      }
      if (!couponToMerchant.has(normalized)) {
        couponToMerchant.set(normalized, merchant);
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
    const hit = couponToMerchant.get(trimmed.toLowerCase());
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
  const personalHit = tracking.some((c) => sets.personal.has(c));
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
