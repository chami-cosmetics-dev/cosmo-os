import type { LoyaltyDto, LoyaltyTierKey, LoyaltyThresholds } from "@/lib/customer-insight/types";

/**
 * Loyalty tiers (lifetime placed-order total):
 * - Standard: 0 … &lt; 100,000
 * - Gold: 100,000 … &lt; 250,000
 * - Platinum: ≥ 250,000
 */
export const LOYALTY_GOLD_MIN = 100_000;
export const LOYALTY_PLATINUM_MIN = 250_000;

/** @deprecated Use LOYALTY_PLATINUM_MIN */
export const LOYALTY_PLATINUM_ABOVE = LOYALTY_PLATINUM_MIN;

export const LOYALTY_THRESHOLDS: LoyaltyThresholds = {
  goldMin: LOYALTY_GOLD_MIN,
  platinumMin: LOYALTY_PLATINUM_MIN,
};

export function classifyLoyaltyTierKey(lifetimeTotal: number): LoyaltyTierKey {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  if (total >= LOYALTY_PLATINUM_MIN) return "platinum";
  if (total >= LOYALTY_GOLD_MIN) return "gold";
  return "standard";
}

export function loyaltyLabel(key: LoyaltyTierKey): string {
  switch (key) {
    case "gold":
      return "Gold";
    case "platinum":
      return "Platinum";
    default:
      return "Standard";
  }
}

export function loyaltyCode(key: LoyaltyTierKey): LoyaltyDto["code"] {
  if (key === "gold") return "loyalcs";
  if (key === "platinum") return "loyalcs2";
  return null;
}

export function buildLoyaltyDto(
  lifetimeTotal: number,
  currency = "LKR"
): LoyaltyDto {
  const key = classifyLoyaltyTierKey(lifetimeTotal);
  return {
    key,
    label: loyaltyLabel(key),
    code: loyaltyCode(key),
    lifetimeTotal: Math.round(lifetimeTotal * 100) / 100,
    currency,
    thresholds: { ...LOYALTY_THRESHOLDS },
  };
}

/**
 * Push to Gold: ≥ 75,000 and still below Gold (&lt; 100,000).
 * These customers are close — push them to achieve Gold.
 */
export const PUSH_GOLD_MIN = 75_000;
export const PUSH_GOLD_MAX = LOYALTY_GOLD_MIN; // exclusive upper bound in isPushToGold

/**
 * Push to Platinum: ≥ 200,000 and still below Platinum (&lt; 250,000).
 * These customers are close — push them to achieve Platinum.
 */
export const PUSH_PLATINUM_MIN = 200_000;
export const PUSH_PLATINUM_MAX = LOYALTY_PLATINUM_MIN; // exclusive upper bound in isPushToPlatinum

export function isPushToGold(lifetimeTotal: number): boolean {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  return total >= PUSH_GOLD_MIN && total < PUSH_GOLD_MAX;
}

export function isPushToPlatinum(lifetimeTotal: number): boolean {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  return total >= PUSH_PLATINUM_MIN && total < PUSH_PLATINUM_MAX;
}
