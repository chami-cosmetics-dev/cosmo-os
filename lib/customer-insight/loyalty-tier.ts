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

/** Push to Gold band: ≥ 75k and &lt; 200k */
export function isPushToGold(lifetimeTotal: number): boolean {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  return total >= LOYALTY_GOLD_MIN && total < LOYALTY_PLATINUM_MIN;
}

/** Push to Platinum: ≥ 200k */
export function isPushToPlatinum(lifetimeTotal: number): boolean {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  return total >= LOYALTY_PLATINUM_MIN;
}
