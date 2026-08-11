import type { InsightVisibility } from "@/lib/customer-insight/types";
import { merMatchKeysFromCouponCodes } from "@/lib/merchant-allocation";

export type ViewerIdentity = {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
  /**
   * Merchant coupon codes for the current user (e.g. "MER56", "MER56-Kaushalya").
   * Used to match when `ContactMaster.assignedMerchant` is stored as a MER code.
   */
  couponCodes?: string[] | null;
  roleNames?: string[];
};

export function normalizeMerchantLabel(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Non-empty display labels a viewer may match against assignedMerchant. */
export function viewerMerchantLabels(viewer: ViewerIdentity): string[] {
  const labels = [viewer.knownName, viewer.name, viewer.email]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * Keys used to match `ContactMaster.assignedMerchant` in DB queries.
 * Includes:
 * - legacy display labels (knownName/name/email)
 * - MER codes derived from the viewer's couponCodes (normalized + raw)
 */
export function merchantMatchKeysForUser(viewer: ViewerIdentity): string[] {
  const keys = [
    ...viewerMerchantLabels(viewer),
    ...merMatchKeysFromCouponCodes(viewer.couponCodes ?? null),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const k = normalizeMerchantLabel(key);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(key);
  }
  return out;
}

function viewerMerKeys(viewer: ViewerIdentity): string[] {
  return merMatchKeysFromCouponCodes(viewer.couponCodes ?? null);
}

/**
 * True when `assignedMerchant` matches either:
 * - legacy display labels (knownName/name/email), or
 * - a MER code format (e.g. "MER56") derived from the viewer's couponCodes.
 */
export function matchesMerchantAllocation(
  viewer: ViewerIdentity,
  assignedMerchant: string | null | undefined
): boolean {
  const assigned = normalizeMerchantLabel(assignedMerchant);
  if (!assigned) return false;

  // 1) Legacy match (stored label)
  if (
    viewerMerchantLabels(viewer).some(
      (label) => normalizeMerchantLabel(label) === assigned
    )
  ) {
    return true;
  }

  // 2) MER match (stored MER code)
  const merKeys = viewerMerKeys(viewer);
  return merKeys.some((k) => normalizeMerchantLabel(k) === assigned);
}

export function isAdminOrSuperAdmin(roleNames: string[] | undefined | null): boolean {
  if (!roleNames?.length) return false;
  return roleNames.includes("admin") || roleNames.includes("super_admin");
}

/**
 * Company-wide Insight filters (all contacts, not only allocated).
 * Admins always; also users with Contact Master / allocation manage rights.
 */
export function canFilterAllInsightContacts(input: {
  roleNames?: string[] | null;
  permissionKeys?: string[] | null;
}): boolean {
  if (isAdminOrSuperAdmin(input.roleNames)) return true;
  const keys = input.permissionKeys ?? [];
  return (
    keys.includes("contacts.master.read") ||
    keys.includes("contacts.master.manage") ||
    keys.includes("contacts.manage") ||
    keys.includes("contacts.allocation.manage")
  );
}

/**
 * Owner when admin/super_admin, or assignedMerchant equals one of the viewer's
 * display labels (knownName / name / email), case-insensitive.
 */
export function isAllocatedOwner(
  viewer: ViewerIdentity,
  assignedMerchant: string | null | undefined
): boolean {
  if (isAdminOrSuperAdmin(viewer.roleNames)) return true;
  return matchesMerchantAllocation(viewer, assignedMerchant);
}

export function insightVisibility(
  viewer: ViewerIdentity,
  assignedMerchant: string | null | undefined
): InsightVisibility {
  return isAllocatedOwner(viewer, assignedMerchant) ? "owner" : "limited";
}
