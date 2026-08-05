import type { LoyaltyDto, LoyaltyTierKey, LoyaltyThresholds } from "@/lib/customer-insight/types";

/** Gold inclusive band; Platinum strictly above this. */
export const LOYALTY_GOLD_MIN = 100_000;
export const LOYALTY_PLATINUM_ABOVE = 250_000;

export const LOYALTY_THRESHOLDS: LoyaltyThresholds = {
  goldMin: LOYALTY_GOLD_MIN,
  platinumAbove: LOYALTY_PLATINUM_ABOVE,
};

export function classifyLoyaltyTierKey(lifetimeTotal: number): LoyaltyTierKey {
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  if (total > LOYALTY_PLATINUM_ABOVE) return "platinum";
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
