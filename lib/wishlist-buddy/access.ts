/**
 * Who can see / change which stock requests. Pure, so the rules are unit tested.
 *
 * - Website tab (`stock_requests.read`): requests from the storefront and imports.
 *   Updating them needs `stock_requests.manage`.
 * - My requests tab (`stock_requests.create`): requests the user created in Cosmo OS; the creator
 *   can update their own.
 * - All staff requests tab (`stock_requests.read_all`): every staff request, grouped by creator.
 *   View only. Does not include website requests and does not allow editing someone else's request.
 * - Admins see and change everything (both original tabs; "My requests" shows every staff request).
 */

export const WEB_REQUEST_SOURCES = ["shopify", "import"] as const;
export const STAFF_REQUEST_SOURCE = "staff";

export type StockRequestScope = "web" | "mine" | "staff";

export type StockRequestViewer = {
  userId: string;
  isAdmin: boolean;
  canViewWeb: boolean;
  canManageWeb: boolean;
  canCreate: boolean;
  /** `stock_requests.read_all`, and not an admin (admins already see every staff request on My requests). */
  canViewAllStaff: boolean;
};

export function viewerFromPermissions(input: {
  userId: string;
  roleNames: string[];
  permissionKeys: string[];
}): StockRequestViewer {
  const isAdmin = input.roleNames.includes("super_admin") || input.roleNames.includes("admin");
  const has = (key: string) => isAdmin || input.permissionKeys.includes(key);
  return {
    userId: input.userId,
    isAdmin,
    canViewWeb: has("stock_requests.read"),
    canManageWeb: has("stock_requests.manage"),
    canCreate: has("stock_requests.create"),
    canViewAllStaff: !isAdmin && input.permissionKeys.includes("stock_requests.read_all"),
  };
}

export function canViewScope(viewer: StockRequestViewer, scope: StockRequestScope): boolean {
  if (scope === "web") return viewer.canViewWeb;
  if (scope === "staff") return viewer.canViewAllStaff;
  return viewer.canCreate;
}

type RequestOwnership = { source: string; createdById: string | null };

export function canViewRequest(viewer: StockRequestViewer, row: RequestOwnership): boolean {
  if (viewer.isAdmin) return true;
  if (row.source === STAFF_REQUEST_SOURCE) {
    return viewer.canViewAllStaff || (viewer.canCreate && row.createdById === viewer.userId);
  }
  return viewer.canViewWeb;
}

export function canEditRequest(viewer: StockRequestViewer, row: RequestOwnership): boolean {
  if (viewer.isAdmin) return true;
  if (row.source === STAFF_REQUEST_SOURCE) return viewer.canCreate && row.createdById === viewer.userId;
  return viewer.canManageWeb;
}

/** Prisma-shaped filter for a tab (kept as a plain object so it is testable without Prisma). */
export function scopeFilter(
  viewer: StockRequestViewer,
  scope: StockRequestScope,
): { source: { in: string[] } } | { source: string; createdById?: string } {
  if (scope === "web") return { source: { in: [...WEB_REQUEST_SOURCES] } };
  if (scope === "staff") return { source: STAFF_REQUEST_SOURCE };
  return viewer.isAdmin ? { source: STAFF_REQUEST_SOURCE } : { source: STAFF_REQUEST_SOURCE, createdById: viewer.userId };
}
