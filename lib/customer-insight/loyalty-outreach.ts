import {
  LOYALTY_GOLD_MIN,
  LOYALTY_PLATINUM_MIN,
  classifyLoyaltyTierKey,
} from "@/lib/customer-insight/loyalty-tier";
import type {
  ContactEventOutcome,
  LoyaltyOutreachStatus,
} from "@/lib/customer-insight/types";

export function isLoyaltyEligibleByTotal(lifetimeTotal: number): boolean {
  return (
    Number.isFinite(lifetimeTotal) && lifetimeTotal >= LOYALTY_GOLD_MIN
  );
}

export function suggestedLoyaltyTier(
  lifetimeTotal: number
): "gold" | "platinum" | null {
  const key = classifyLoyaltyTierKey(lifetimeTotal);
  if (key === "platinum") return "platinum";
  if (key === "gold") return "gold";
  return null;
}

export function canAssignLoyaltyTier(
  tier: "gold" | "platinum",
  lifetimeTotal: number
): boolean {
  if (tier === "platinum") return lifetimeTotal >= LOYALTY_PLATINUM_MIN;
  return (
    lifetimeTotal >= LOYALTY_GOLD_MIN && lifetimeTotal < LOYALTY_PLATINUM_MIN
  );
}

export function nextOutreachStatus(
  action: ContactEventOutcome | "loyalty_informed" | "responded" | "not_responded"
): LoyaltyOutreachStatus {
  switch (action) {
    case "loyalty_informed":
      return "contacted";
    case "responded":
      return "responded";
    case "not_responded":
      return "not_responded";
    default:
      return "contacted";
  }
}

export const LOYALTY_OUTREACH_QUEUE_STATUSES: LoyaltyOutreachStatus[] = [
  "eligible",
  "contacted",
  "responded",
  "not_responded",
];
