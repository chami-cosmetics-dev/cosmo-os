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

export type AssignedLoyaltyTier = "gold" | "platinum";

export type PendingLoyaltySuggestion = {
  suggestedTier: AssignedLoyaltyTier;
  kind: "new" | "upgrade";
  currentAssigned: AssignedLoyaltyTier | null;
};

function normalizeAssignedTier(
  assigned: string | null | undefined
): AssignedLoyaltyTier | null {
  if (assigned === "gold" || assigned === "platinum") return assigned;
  return null;
}

/**
 * Next Gold/Platinum action for a contact.
 * - Unassigned + spend ≥ Gold → new assign
 * - Assigned Gold + spend ≥ Platinum → Platinum upgrade
 * Already Platinum, or Gold spend already registered Gold → null
 */
export function pendingLoyaltySuggestion(
  assignedTier: string | null | undefined,
  lifetimeTotal: number
): PendingLoyaltySuggestion | null {
  const assigned = normalizeAssignedTier(assignedTier);
  const suggested = suggestedLoyaltyTier(lifetimeTotal);
  if (!suggested) return null;
  if (assigned === "platinum") return null;
  if (assigned === "gold") {
    if (suggested !== "platinum") return null;
    return {
      suggestedTier: "platinum",
      kind: "upgrade",
      currentAssigned: "gold",
    };
  }
  return { suggestedTier: suggested, kind: "new", currentAssigned: null };
}

export function canAssignOrUpgradeLoyaltyTier(input: {
  tier: "gold" | "platinum";
  lifetimeTotal: number;
  currentAssigned: string | null | undefined;
}): boolean {
  const assigned = normalizeAssignedTier(input.currentAssigned);
  if (assigned === "platinum") return false;
  if (assigned === input.tier) return false;
  if (assigned === "gold" && input.tier !== "platinum") return false;
  return canAssignLoyaltyTier(input.tier, input.lifetimeTotal);
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
