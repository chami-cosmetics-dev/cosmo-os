import "server-only";

import { getCurrentUserContext, hasPermission } from "@/lib/rbac";
import { loadShopScope } from "@/lib/material-transfer/scope";
import type { ShopScope } from "@/lib/material-transfer/receive";

export const MATERIAL_TRANSFER_PERMISSION = "store.material_transfer.write";

const EMPTY_SCOPE: ShopScope = { explicitWarehouses: [], outletName: null };

export async function requireMaterialTransferAccess() {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  if (!hasPermission(context, MATERIAL_TRANSFER_PERMISSION)) {
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

export async function requireMaterialTransferView() {
  const context = await getCurrentUserContext();
  if (!context?.user) {
    return { ok: false as const, status: 401 as const, error: "Unauthorized" };
  }
  const canWrite = hasPermission(context, MATERIAL_TRANSFER_PERMISSION);
  const companyId = context.user.companyId;
  if (!companyId) {
    return {
      ok: false as const,
      status: 404 as const,
      error: "No company associated with your account",
    };
  }
  const userId = context.user.id;
  const loaded = userId ? await loadShopScope(userId, companyId) : EMPTY_SCOPE;
  const scope: ShopScope = { explicitWarehouses: [], outletName: loaded.outletName };
  const canReceive = Boolean(scope.outletName);
  if (!canWrite && !canReceive) {
    return { ok: false as const, status: 403 as const, error: "Forbidden" };
  }
  return { ok: true as const, context, companyId, canWrite, canReceive, scope };
}
