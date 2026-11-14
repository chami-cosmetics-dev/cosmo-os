import {
  getMerchantDisplayName,
  matchMerchantFromCouponMap,
  type MerchantUser,
} from "@/lib/merchant-groups";
import {
  DM_GENERAL_DISPLAY_NAME,
  normalizeDashboardMerchantLabel,
  STAFF_SALES_DISPLAY_NAME,
} from "@/lib/merchant-dm-sales";
import {
  collectMerchantWholesaleCodes,
  normalizeWholesaleMerCodeKey,
  orderIsWholesale,
  orderWholesaleTrackingCoupons,
  wholesaleDashboardMerchantName,
} from "@/lib/merchant-wholesale";

export type DashboardMerchantHit = {
  id: string | null;
  name: string;
  isWholesale: boolean;
};

type WholesaleOwner = { id: string; name: string };

/** Staff who own MER codes or WH codes, for main-dashboard attribution. */
export function dashboardMerchantUserWhere(companyId: string) {
  return {
    companyId,
    OR: [
      { couponCodes: { isEmpty: false } },
      { wholesaleCouponCodes: { isEmpty: false } },
    ],
  };
}

export const dashboardMerchantUserSelect = {
  id: true,
  knownName: true,
  name: true,
  email: true,
  couponCodes: true,
  wholesaleCouponCodes: true,
} as const;

export function buildWholesaleOwnerMap(
  users: Array<MerchantUser & { wholesaleCouponCodes?: string[] | null }>,
): Map<string, WholesaleOwner> {
  const map = new Map<string, WholesaleOwner>();
  for (const user of users) {
    const owner: WholesaleOwner = {
      id: user.id,
      name: normalizeDashboardMerchantLabel(getMerchantDisplayName(user)),
    };
    for (const code of collectMerchantWholesaleCodes(user)) {
      const keys = new Set<string>();
      const trimmed = code.trim().toLowerCase();
      if (trimmed) keys.add(trimmed);
      const normalized = normalizeWholesaleMerCodeKey(code);
      if (normalized) keys.add(normalized.toLowerCase());
      for (const key of keys) {
        if (!map.has(key)) map.set(key, owner);
      }
    }
  }
  return map;
}

export function matchWholesaleOwner(
  orderCoupons: string[],
  owners: Map<string, WholesaleOwner>,
): WholesaleOwner | null {
  for (const code of orderWholesaleTrackingCoupons(orderCoupons)) {
    const trimmed = code.trim().toLowerCase();
    const direct = owners.get(trimmed);
    if (direct) return direct;
    const key = normalizeWholesaleMerCodeKey(code);
    if (key) {
      const hit = owners.get(key.toLowerCase());
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Personal MER stays on the merchant. No MER → DM-General (assigned cashier
 * is not a dashboard merchant). WH orders get a separate wholesale name.
 */
export function resolveDashboardOrderMerchant(input: {
  orderCoupons: string[];
  couponToUser: Map<string, { id: string | null; name: string }>;
  wholesaleOwners: Map<string, WholesaleOwner>;
  assignedMerchantId: string | null | undefined;
  assignedMerchant: {
    knownName?: string | null;
    name?: string | null;
    email?: string | null;
    couponCodes?: string[] | null;
  } | null;
  userToGroup: Map<string, { id: string; name: string }>;
  locationName?: string | null;
  locationDefaultMerchant?: { id: string | null; name: string | null } | null;
}): DashboardMerchantHit {
  if (orderIsWholesale(input.orderCoupons)) {
    const owner = matchWholesaleOwner(input.orderCoupons, input.wholesaleOwners);
    if (owner) {
      return {
        id: owner.id,
        name: wholesaleDashboardMerchantName(owner.name),
        isWholesale: true,
      };
    }
    return { id: null, name: "Wholesale", isWholesale: true };
  }

  const matched = matchMerchantFromCouponMap(input.orderCoupons, input.couponToUser);
  if (matched?.name === STAFF_SALES_DISPLAY_NAME) {
    return { id: matched.id, name: matched.name, isWholesale: false };
  }
  if (matched && matched.name !== DM_GENERAL_DISPLAY_NAME) {
    return {
      id: matched.id,
      name: normalizeDashboardMerchantLabel(matched.name),
      isWholesale: false,
    };
  }
  return { id: null, name: DM_GENERAL_DISPLAY_NAME, isWholesale: false };
}

export function dashboardMerchantRowKey(hit: {
  id: string | null;
  name: string;
  isWholesale: boolean;
}): string {
  const base = hit.id ?? `__${hit.name.toLowerCase()}`;
  return hit.isWholesale ? `wh:${base}` : base;
}
