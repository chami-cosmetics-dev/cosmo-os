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
