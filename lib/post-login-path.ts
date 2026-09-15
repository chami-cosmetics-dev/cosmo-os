import { isCompanyAdminRole, userHasMerchantRole } from "@/lib/merchant-role";

/** Roles that keep the company overview dashboard as home. */
const DASHBOARD_HOME_ROLES = new Set([
  "super_admin",
  "admin",
  "manager",
  "finance",
  "hod",
  "viewer",
  "seo_team",
]);

/** e.g. stores-level-01, store-level-02, Stores 01 */
const STORE_ROLE_NAME_RE = /^stores?(?:[\s_-]*level)?[\s_-]*0*\d+$/i;

export function isStoreRoleName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;
  if (STORE_ROLE_NAME_RE.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower === "store" ||
    lower === "stores" ||
    lower === "warehouse" ||
    lower.includes("warehouse")
  );
}

export function userHasStoreRole(roleNames: string[] | null | undefined): boolean {
  return (roleNames ?? []).some((name) => isStoreRoleName(name));
}

export function userHasPurchasingHome(
  roleNames: string[] | null | undefined,
  permissionKeys: string[] | null | undefined
): boolean {
  const names = roleNames ?? [];
  if (names.some((name) => /purchas/i.test(name))) return true;
  const keys = permissionKeys ?? [];
  return (
    keys.includes("purchasing.osf.read") || keys.includes("purchasing.osf.manage")
  );
}

/**
 * Post-login / `/dashboard` home path by role.
 * Merchant → merchant dash; store → fulfillment; purchasing → OSF; else overview.
 */
export function resolvePostLoginPath(input: {
  roleNames?: string[] | null;
  permissionKeys?: string[] | null;
}): string {
  const roleNames = input.roleNames ?? [];

  if (
    isCompanyAdminRole(roleNames) ||
    roleNames.some((role) => DASHBOARD_HOME_ROLES.has(role))
  ) {
    return "/dashboard";
  }

  if (userHasMerchantRole(roleNames)) {
    return "/dashboard/merchant";
  }

  if (userHasStoreRole(roleNames)) {
    return "/dashboard/fulfillment";
  }

  if (userHasPurchasingHome(roleNames, input.permissionKeys)) {
    return "/dashboard/purchasing/osf";
  }

  return "/dashboard";
}
