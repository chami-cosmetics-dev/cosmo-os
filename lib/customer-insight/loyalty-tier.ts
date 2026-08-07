import type { LoyaltyDto, LoyaltyTierKey, LoyaltyThresholds } from "@/lib/customer-insight/types";

/** Gold inclusive; Platinum inclusive at this amount and above. */
export const LOYALTY_GOLD_MIN = 75_000;
export const LOYALTY_PLATINUM_MIN = 200_000;

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

/** Push to Gold band: ≥ 75,000 and ≤ 100,000 */
export const PUSH_GOLD_MIN = 75_000;
export const PUSH_GOLD_MAX = 100_000;

/** Push to Platinum band: ≥ 150,000 and ≤ 200,000 */
export const PUSH_PLATINUM_MIN = 150_000;
export const PUSH_PLATINUM_MAX = 200_000;

/** Push to Gold band: ≥ 75k and ≤ 100k */
export function isPushToGold(lifetimeTotal: number): boolean {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  return total >= PUSH_GOLD_MIN && total <= PUSH_GOLD_MAX;
}

/** Push to Platinum: ≥ 150k and ≤ 200k */
export function isPushToPlatinum(lifetimeTotal: number): boolean {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  return total >= PUSH_PLATINUM_MIN && total <= PUSH_PLATINUM_MAX;
}
