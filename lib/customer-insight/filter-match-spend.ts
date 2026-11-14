/**
 * Register a brand/item filter hit.
 * Voided/cancelled matches stay in the result set with 0 spend.
 */
export function addFilterMatchSpend(
  spendByContact: Map<string, number>,
  contactId: string,
  amount: number
): void {
  if (!contactId) return;
  const add = Number.isFinite(amount) && amount > 0 ? amount : 0;
  if (add > 0) {
    spendByContact.set(
      contactId,
      (spendByContact.get(contactId) ?? 0) + add
    );
    return;
  }
  if (!spendByContact.has(contactId)) {
    spendByContact.set(contactId, 0);
  }
}
