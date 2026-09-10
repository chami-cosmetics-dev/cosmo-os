export type CarriedTargetAmounts = {
  targetAmount: number;
  shopTargetAmount: number | null;
  onlineTargetAmount: number | null;
  wholesaleTargetAmount: number | null;
};

/** Manual set/update or explicit remove means this month owns its target. */
export function shouldSyncCarriedTarget(
  thisMonthActions: readonly string[],
): boolean {
  return !thisMonthActions.some(
    (action) => action === "set" || action === "update" || action === "remove",
  );
}

function amountKey(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 100) / 100;
}

export function carriedTargetAmountsEqual(
  a: CarriedTargetAmounts,
  b: CarriedTargetAmounts,
): boolean {
  return (
    amountKey(a.targetAmount) === amountKey(b.targetAmount) &&
    amountKey(a.shopTargetAmount) === amountKey(b.shopTargetAmount) &&
    amountKey(a.onlineTargetAmount) === amountKey(b.onlineTargetAmount) &&
    amountKey(a.wholesaleTargetAmount) === amountKey(b.wholesaleTargetAmount)
  );
}
