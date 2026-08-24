import "server-only";

import { getCurrentUserContext, hasPermission } from "@/lib/rbac";

export const STORE_STOCK_COUNT_PERMISSION = "store.stock_count.read";

export async function requireStoreStockCountAccess() {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  if (!hasPermission(context, STORE_STOCK_COUNT_PERMISSION)) {
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
