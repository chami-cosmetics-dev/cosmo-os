import { isCompanyAdminRole, userHasMerchantRole } from "@/lib/merchant-role";

/** Follow-up return actions. Store users may only mark the item returned to store. */
export const MERCHANT_RETURN_ACTION_TYPES = [
  "save",
  "rearrange",
  "confirm_rearrange_paid",
  "request_finance_approval",
  "request_cancel",
  "resend_void_approval",
] as const;

export type MerchantReturnActionType = (typeof MERCHANT_RETURN_ACTION_TYPES)[number];

export function isMerchantReturnAction(actionType: string | null | undefined): boolean {
  if (!actionType) return true;
  return (MERCHANT_RETURN_ACTION_TYPES as readonly string[]).includes(actionType);
}

/** Merchant-role users and company admins. Store users are excluded. */
export function canTakeMerchantReturnActions(roleNames: string[] | null | undefined): boolean {
  return userHasMerchantRole(roleNames) || isCompanyAdminRole(roleNames);
}
