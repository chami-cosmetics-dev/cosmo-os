import type { InsightVisibility } from "@/lib/customer-insight/types";

export type ViewerIdentity = {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
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
  const assigned = normalizeMerchantLabel(assignedMerchant);
  if (!assigned) return false;
  return viewerMerchantLabels(viewer).some(
    (label) => normalizeMerchantLabel(label) === assigned
  );
}

export function insightVisibility(
  viewer: ViewerIdentity,
  assignedMerchant: string | null | undefined
): InsightVisibility {
  return isAllocatedOwner(viewer, assignedMerchant) ? "owner" : "limited";
}
