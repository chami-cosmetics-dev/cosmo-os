/** Contact Master roster bucket for a Shopify customer with no merchant. */
export const SHOPIFY_UNALLOCATED_ASSIGNED_MERCHANT = "DM - General";

/**
 * Shopify allocation label. A real order merchant wins.
 * No merchant falls back to the DM - General roster bucket.
 */
export function shopifyUnallocatedMerchantLabel(
  recentMerchant: string | null | undefined
): string {
  const label = recentMerchant?.trim();
  return label || SHOPIFY_UNALLOCATED_ASSIGNED_MERCHANT;
}

/** Merchant display label used for ContactMaster.assignedMerchant. */
export function getMerchantDisplayName(user: {
  knownName?: string | null;
  name?: string | null;
  email?: string | null;
}): string | null {
  const label =
    user.knownName?.trim() || user.name?.trim() || user.email?.trim() || "";
  return label || null;
}

/**
 * When assignedMerchant is empty and a purchase merchant label exists,
 * return the label to set. Never overwrites an existing allocation.
 */
export function resolveAutoAllocateMerchant(input: {
  assignedMerchant: string | null | undefined;
  purchaseMerchantLabel: string | null | undefined;
}): string | null {
  const existing = input.assignedMerchant?.trim();
  if (existing) return null;
  const next = input.purchaseMerchantLabel?.trim();
  return next || null;
}
