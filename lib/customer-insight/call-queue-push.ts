/** Call-queue assign targeting bands (inclusive). Do not reuse isPushToGold. */

export const CALL_QUEUE_PUSH_GOLD_MIN = 75_000;
export const CALL_QUEUE_PUSH_GOLD_MAX = 100_000;
export const CALL_QUEUE_PUSH_PLATINUM_MIN = 200_000;
export const CALL_QUEUE_PUSH_PLATINUM_MAX = 250_000;

export function isCallQueuePushToGold(lifetimeTotal: number): boolean {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  return total >= CALL_QUEUE_PUSH_GOLD_MIN && total <= CALL_QUEUE_PUSH_GOLD_MAX;
}

export function isCallQueuePushToPlatinum(lifetimeTotal: number): boolean {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  return (
    total >= CALL_QUEUE_PUSH_PLATINUM_MIN && total <= CALL_QUEUE_PUSH_PLATINUM_MAX
  );
}

export function matchesCallQueuePushBands(
  lifetimeTotal: number,
  pushToGold: boolean,
  pushToPlatinum: boolean
): boolean {
  if (!pushToGold && !pushToPlatinum) return true;
  const gold = pushToGold && isCallQueuePushToGold(lifetimeTotal);
  const plat = pushToPlatinum && isCallQueuePushToPlatinum(lifetimeTotal);
  return gold || plat;
}
