import { classifyLoyaltyTierKey } from "@/lib/customer-insight/loyalty-tier";
import { matchesCallQueuePushBands } from "@/lib/customer-insight/call-queue-push";

export type CallQueueAssignFilterValues = {
  pushToGold?: boolean;
  pushToPlatinum?: boolean;
  loyalty?: "standard" | "gold" | "platinum" | "unassigned" | "";
  lastPurchaseFrom?: string;
  lastPurchaseTo?: string;
  brand?: string;
};

function isSet(value?: string | null): boolean {
  return Boolean(value && value.trim());
}

export function isoDayStartUtc(isoDay: string): Date {
  return new Date(`${isoDay.trim()}T00:00:00.000Z`);
}

export function isoDayEndUtc(isoDay: string): Date {
  return new Date(`${isoDay.trim()}T23:59:59.999Z`);
}

/** Inclusive from and/or to. Unset range → pass. No last-purchase date when range set → fail. */
export function matchesLastPurchaseRange(
  lastPurchaseAt: Date | null,
  from?: string,
  to?: string
): boolean {
  if (!isSet(from) && !isSet(to)) return true;
  if (lastPurchaseAt == null) return false;
  const t = lastPurchaseAt.getTime();
  if (isSet(from) && t < isoDayStartUtc(from!).getTime()) return false;
  if (isSet(to) && t > isoDayEndUtc(to!).getTime()) return false;
  return true;
}

export function matchesLoyaltyFilter(
  loyalty: CallQueueAssignFilterValues["loyalty"],
  lifetimeTotal: number,
  loyaltyAssignedTier: string | null | undefined
): boolean {
  if (!isSet(loyalty ?? "")) return true;
  if (loyalty === "unassigned") return !loyaltyAssignedTier?.trim();
  if (loyalty === "standard" || loyalty === "gold" || loyalty === "platinum") {
    return classifyLoyaltyTierKey(lifetimeTotal) === loyalty;
  }
  return true;
}

/**
 * All active filters AND together.
 * Push to Gold + Push to Platinum = union (OR) of those two bands, then AND the rest.
 */
export function matchesCallQueueAssignFilters(
  row: {
    lifetimeTotal: number;
    lastPurchaseAt: Date | null;
    loyaltyAssignedTier: string | null | undefined;
    boughtBrand: boolean;
  },
  filters: CallQueueAssignFilterValues
): boolean {
  if (
    !matchesCallQueuePushBands(
      row.lifetimeTotal,
      Boolean(filters.pushToGold),
      Boolean(filters.pushToPlatinum)
    )
  ) {
    return false;
  }
  if (
    !matchesLoyaltyFilter(
      filters.loyalty,
      row.lifetimeTotal,
      row.loyaltyAssignedTier
    )
  ) {
    return false;
  }
  if (
    !matchesLastPurchaseRange(
      row.lastPurchaseAt,
      filters.lastPurchaseFrom,
      filters.lastPurchaseTo
    )
  ) {
    return false;
  }
  if (isSet(filters.brand) && !row.boughtBrand) return false;
  return true;
}

export function callQueueNeedsLifetimeTotals(
  filters: CallQueueAssignFilterValues
): boolean {
  if (filters.pushToGold || filters.pushToPlatinum) return true;
  const loyalty = filters.loyalty?.trim();
  return loyalty === "standard" || loyalty === "gold" || loyalty === "platinum";
}
