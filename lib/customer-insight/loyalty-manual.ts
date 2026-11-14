import {
  LOYALTY_GOLD_MIN,
  LOYALTY_PLATINUM_MIN,
} from "@/lib/customer-insight/loyalty-tier";

export const CONTACTS_LOYALTY_MANUAL_ASSIGN = "contacts.loyalty.manual_assign";

export type ManualLoyaltyTier = "gold" | "platinum";

function normalizeAssigned(
  assigned: string | null | undefined
): ManualLoyaltyTier | null {
  if (assigned === "gold" || assigned === "platinum") return assigned;
  return null;
}

/**
 * Tiers a permitted user may set without spend eligibility.
 * Gold only when unassigned and spend is below Gold.
 * Platinum when spend is below Platinum and the contact is not already Platinum.
 */
export function availableManualLoyaltyTiers(
  assignedTier: string | null | undefined,
  lifetimeTotal: number
): ManualLoyaltyTier[] {
  const assigned = normalizeAssigned(assignedTier);
  if (assigned === "platinum") return [];
  const total = Number.isFinite(lifetimeTotal) ? lifetimeTotal : 0;
  const tiers: ManualLoyaltyTier[] = [];
  if (!assigned && total < LOYALTY_GOLD_MIN) {
    tiers.push("gold");
  }
  if (total < LOYALTY_PLATINUM_MIN) {
    tiers.push("platinum");
  }
  return tiers;
}

export function canManualAssignLoyaltyTier(input: {
  tier: ManualLoyaltyTier;
  currentAssigned: string | null | undefined;
  lifetimeTotal: number;
}): boolean {
  return availableManualLoyaltyTiers(
    input.currentAssigned,
    input.lifetimeTotal
  ).includes(input.tier);
}
