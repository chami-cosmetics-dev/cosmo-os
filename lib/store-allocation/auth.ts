import "server-only";

import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const STORE_ALLOCATION_PERMISSION = "store.allocation.read";

export async function requireStoreAllocationAccess() {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  if (!hasPermission(context, STORE_ALLOCATION_PERMISSION)) {
    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  }
  const companyId = context.user.companyId;
  if (!companyId) {
    return {
      ok: false as const,
      status: 404 as const,
      error: "No company associated with your account",
    };
  }
  return { ok: true as const, context, companyId };
}
