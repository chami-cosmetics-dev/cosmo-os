import {
  LOYALTY_GOLD_MIN,
  LOYALTY_PLATINUM_MIN,
  classifyLoyaltyTierKey,
} from "@/lib/customer-insight/loyalty-tier";
import type { ProgressBarDto } from "@/lib/customer-insight/types";

export function buildProgressBarDto(lifetimeTotal: number): ProgressBarDto {
  const currentTotal = Number.isFinite(lifetimeTotal) ? Math.max(0, lifetimeTotal) : 0;
  const tier = classifyLoyaltyTierKey(currentTotal);
  let amountToNext = 0;
  if (currentTotal < LOYALTY_GOLD_MIN) {
    amountToNext = LOYALTY_GOLD_MIN - currentTotal;
  } else if (currentTotal < LOYALTY_PLATINUM_MIN) {
    amountToNext = LOYALTY_PLATINUM_MIN - currentTotal;
  }

  return {
    currentTotal: Math.round(currentTotal * 100) / 100,
    goldMin: LOYALTY_GOLD_MIN,
    platinumMin: LOYALTY_PLATINUM_MIN,
    amountToNext: Math.round(amountToNext * 100) / 100,
    tier,
  };
}

/** Position of current total on a 0→platinum scale (0–1), for bar fill width. */
export function progressBarFillRatio(lifetimeTotal: number): number {
  const total = Number.isFinite(lifetimeTotal) ? Math.max(0, lifetimeTotal) : 0;
  if (LOYALTY_PLATINUM_MIN <= 0) return 0;
  return Math.min(1, total / LOYALTY_PLATINUM_MIN);
}

export function goldMilestoneRatio(): number {
  return LOYALTY_GOLD_MIN / LOYALTY_PLATINUM_MIN;
}
