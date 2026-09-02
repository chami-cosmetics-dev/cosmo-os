import {
  dmGeneralAssignedMerchantAliases,
  findAssignedMerchantAliasGroup,
  isDmGeneralAssignedMerchant,
} from "@/lib/customer-insight/merchant-label-aliases";
import type { InsightVisibility } from "@/lib/customer-insight/types";
import { merMatchKeysFromCouponCodes } from "@/lib/merchant-allocation";
import { userHasMerchantRole } from "@/lib/merchant-role";
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
  permissionKeys?: string[] | null;
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

function expandMerchantLabelAliases(label: string): string[] {
  const group = findAssignedMerchantAliasGroup(label);
  return group ? group.aliases : [label];
}

/**
 * Contact query keys for merchant-scoped Insight lists.
 * Expands alias groups (e.g. MER115 ↔ DM - General) and includes the shared
 * DM-General pool for all merchant-role users.
 */
export function merchantContactAllocationKeys(viewer: ViewerIdentity): string[] {
  const base = merchantMatchKeysForUser(viewer);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = normalizeMerchantLabel(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const key of base) {
    for (const alias of expandMerchantLabelAliases(key)) {
      push(alias);
    }
  }

  if (userHasMerchantRole(viewer.roleNames)) {
    for (const alias of dmGeneralAssignedMerchantAliases()) {
      push(alias);
    }
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
function merchantLabelVariants(label: string | null | undefined): string[] {
  const trimmed = (label ?? "").trim();
  if (!trimmed) return [];
  const group = findAssignedMerchantAliasGroup(trimmed);
  return group ? group.aliases : [trimmed];
}

export function matchesMerchantAllocation(
  viewer: ViewerIdentity,
  assignedMerchant: string | null | undefined
): boolean {
  const assigned = normalizeMerchantLabel(assignedMerchant);
  if (!assigned) return false;

  if (
    userHasMerchantRole(viewer.roleNames) &&
    isDmGeneralAssignedMerchant(assignedMerchant)
  ) {
    return true;
  }

  const assignedKeys = new Set(
    merchantLabelVariants(assignedMerchant).map(normalizeMerchantLabel)
  );

  // 1) Legacy match (stored label + historical aliases)
  for (const label of viewerMerchantLabels(viewer)) {
    for (const variant of merchantLabelVariants(label)) {
      if (assignedKeys.has(normalizeMerchantLabel(variant))) return true;
    }
  }

  // 2) MER match (stored MER code)
  const merKeys = viewerMerKeys(viewer);
  return merKeys.some((k) => assignedKeys.has(normalizeMerchantLabel(k)));
}

export function isAdminOrSuperAdmin(roleNames: string[] | undefined | null): boolean {
  if (!roleNames?.length) return false;
  return roleNames.includes("admin") || roleNames.includes("super_admin");
}

/** Customer Insight admin capabilities (company-wide filters + owner view). */
export function hasInsightAdminView(input: {
  roleNames?: string[] | null;
  permissionKeys?: string[] | null;
}): boolean {
  if (isAdminOrSuperAdmin(input.roleNames)) return true;
  return (input.permissionKeys ?? []).includes("contacts.insight.admin_view");
}

/**
 * Company-wide Insight filters (all contacts, not only allocated).
 * Admins, Insight admin view, or Contact Master / allocation manage rights.
 */
export function canFilterAllInsightContacts(input: {
  roleNames?: string[] | null;
  permissionKeys?: string[] | null;
}): boolean {
  if (hasInsightAdminView(input)) return true;
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
  if (hasInsightAdminView(viewer)) return true;
  return matchesMerchantAllocation(viewer, assignedMerchant);
}

export function insightVisibility(
  viewer: ViewerIdentity,
  assignedMerchant: string | null | undefined
): InsightVisibility {
  return isAllocatedOwner(viewer, assignedMerchant) ? "owner" : "limited";
}
