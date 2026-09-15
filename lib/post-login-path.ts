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

/** Same fulfillment read keys as sidebar + `/dashboard/fulfillment` index. */
const FULFILLMENT_NAV_READ_KEYS = [
  "fulfillment.sample_free_issue.read",
  "fulfillment.order_print.read",
  "fulfillment.ready_dispatch.read",
  "fulfillment.delivery_invoice.read",
  "fulfillment.invoice_complete.read",
  "fulfillment.falcon_upload.read",
  "fulfillment.waybill_lookup.read",
  "fulfillment.waybill_lookup.import",
] as const;

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

export function hasStorePermission(permissionKeys: string[] | null | undefined): boolean {
  const keys = permissionKeys ?? [];
  return (
    keys.includes("store.allocation.read") || keys.includes("store.stock_count.read")
  );
}

export function hasFulfillmentNavAccess(input: {
  roleNames?: string[] | null;
  permissionKeys?: string[] | null;
}): boolean {
  const roleNames = input.roleNames ?? [];
  if (roleNames.includes("super_admin") || roleNames.includes("admin")) {
    return true;
  }
  const keys = input.permissionKeys ?? [];
  return FULFILLMENT_NAV_READ_KEYS.some((key) => keys.includes(key));
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

function isStoreStaff(input: {
  roleNames?: string[] | null;
  permissionKeys?: string[] | null;
}): boolean {
  return (
    userHasStoreRole(input.roleNames) || hasStorePermission(input.permissionKeys)
  );
}

/** Store home: Fulfillment when they have that access (sidebar), else store tools. */
function resolveStoreHomePath(input: {
  roleNames?: string[] | null;
  permissionKeys?: string[] | null;
}): string {
  if (hasFulfillmentNavAccess(input)) {
    return "/dashboard/fulfillment";
  }
  const keys = input.permissionKeys ?? [];
  if (keys.includes("store.allocation.read")) {
    return "/dashboard/store/allocation";
  }
  if (keys.includes("store.stock_count.read")) {
    return "/dashboard/store/stock-count";
  }
  return "/dashboard/fulfillment";
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
  const permissionKeys = input.permissionKeys ?? [];

  if (
    isCompanyAdminRole(roleNames) ||
    roleNames.some((role) => DASHBOARD_HOME_ROLES.has(role))
  ) {
    return "/dashboard";
  }

  if (userHasMerchantRole(roleNames)) {
    return "/dashboard/merchant";
  }

  if (isStoreStaff(input)) {
    return resolveStoreHomePath(input);
  }

  if (userHasPurchasingHome(roleNames, permissionKeys)) {
    return "/dashboard/purchasing/osf";
  }

  if (
    hasFulfillmentNavAccess(input) &&
    !permissionKeys.includes("dashboard.view")
  ) {
    return "/dashboard/fulfillment";
  }

  return "/dashboard";
}
