import { isCompanyAdminRole, userHasMerchantRole } from "@/lib/merchant-role";

/** Follow-up return actions. Cancel, finance, and void stay merchant-only. */
export const MERCHANT_RETURN_ACTION_TYPES = [
  "save",
  "rearrange",
  "confirm_rearrange_paid",
  "request_finance_approval",
  "request_cancel",
  "resend_void_approval",
] as const;

/** Store roles may rearrange a returned order. They cannot cancel or change payment. */
export const STORE_REARRANGE_ACTION_TYPES = ["rearrange", "confirm_rearrange_paid"] as const;

export type MerchantReturnActionType = (typeof MERCHANT_RETURN_ACTION_TYPES)[number];

export function isMerchantReturnAction(actionType: string | null | undefined): boolean {
  if (!actionType) return true;
  return (MERCHANT_RETURN_ACTION_TYPES as readonly string[]).includes(actionType);
}

export function isStoreRearrangeAction(actionType: string | null | undefined): boolean {
  if (!actionType) return false;
  return (STORE_REARRANGE_ACTION_TYPES as readonly string[]).includes(actionType);
}

export function userHasStoreRole(roleNames: string[] | null | undefined): boolean {
  return (roleNames ?? []).some((name) => {
    const role = name.trim().toLowerCase();
    return (
      role === "store" ||
      role === "stores" ||
      role.startsWith("store-") ||
      role.startsWith("stores-") ||
      role === "warehouse" ||
      role.startsWith("warehouse-")
    );
  });
}

/** Merchant-role users and company admins. Store users are excluded. */
export function canTakeMerchantReturnActions(roleNames: string[] | null | undefined): boolean {
  return userHasMerchantRole(roleNames) || isCompanyAdminRole(roleNames);
}

export function canRearrangeReturn(roleNames: string[] | null | undefined): boolean {
  return canTakeMerchantReturnActions(roleNames) || userHasStoreRole(roleNames);
}

export function canPerformReturnAction(
  actionType: string | null | undefined,
  roleNames: string[] | null | undefined,
): boolean {
  if (!isMerchantReturnAction(actionType)) return true;
  if (isStoreRearrangeAction(actionType)) return canRearrangeReturn(roleNames);
  return canTakeMerchantReturnActions(roleNames);
}
