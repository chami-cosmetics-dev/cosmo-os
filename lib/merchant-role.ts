/**
 * Merchant dashboard identity: users whose role name is like
 * "Merchant 01", "merchant 02", "merchant01", "merchant-level-01", "merchant-level-02".
 */

const MERCHANT_ROLE_NAME_RE =
  /^merchant(?:[\s_-]*level)?[\s_-]*0*\d+$/i;

export function isMerchantRoleName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;
  return MERCHANT_ROLE_NAME_RE.test(trimmed);
}

export function userHasMerchantRole(roleNames: string[] | null | undefined): boolean {
  return (roleNames ?? []).some((name) => isMerchantRoleName(name));
}

export function isCompanyAdminRole(roleNames: string[] | null | undefined): boolean {
  const names = roleNames ?? [];
  return names.includes("super_admin") || names.includes("admin");
}

/** Merchant dashboard admin slice: company admin role or explicit permission. */
export const MERCHANT_DASHBOARD_ADMIN_PERMISSION = "dashboard.merchant_admin_view";

export function hasMerchantDashboardAdminView(input: {
  roleNames?: string[] | null;
  permissionKeys?: string[] | null;
}): boolean {
  if (isCompanyAdminRole(input.roleNames)) return true;
  return (input.permissionKeys ?? []).includes(MERCHANT_DASHBOARD_ADMIN_PERMISSION);
}

/** Merchant dashboard access via role: company admins only (not merchant-level users). */
export function canAccessMerchantDashboard(roleNames: string[] | null | undefined): boolean {
  return isCompanyAdminRole(roleNames);
}
