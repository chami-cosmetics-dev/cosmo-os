import { describe, expect, it } from "vitest";

import {
  callQueueNeedsLifetimeTotals,
  matchesCallQueueAssignFilters,
  matchesLastPurchaseRange,
  matchesLoyaltyFilter,
} from "@/lib/customer-insight/call-queue-assign-filters";

const base = {
  lifetimeTotal: 80_000,
  lastPurchaseAt: new Date("2026-06-15T12:00:00.000Z"),
  loyaltyAssignedTier: null as string | null,
  boughtBrand: true,
};

describe("call-queue assign filters alone and combined", () => {
  it("no filters → all pass", () => {
    expect(matchesCallQueueAssignFilters(base, {})).toBe(true);
  });

  it("Push to Gold alone", () => {
    expect(
      matchesCallQueueAssignFilters(base, { pushToGold: true })
    ).toBe(true);
    expect(
      matchesCallQueueAssignFilters(
        { ...base, lifetimeTotal: 150_000 },
        { pushToGold: true }
      )
    ).toBe(false);
  });

  it("Push to Platinum alone", () => {
    expect(
      matchesCallQueueAssignFilters(
        { ...base, lifetimeTotal: 220_000 },
        { pushToPlatinum: true }
      )
    ).toBe(true);
    expect(
      matchesCallQueueAssignFilters(base, { pushToPlatinum: true })
    ).toBe(false);
  });

  it("both push chips → union", () => {
    const both = { pushToGold: true, pushToPlatinum: true };
    expect(matchesCallQueueAssignFilters(base, both)).toBe(true);
    expect(
      matchesCallQueueAssignFilters(
        { ...base, lifetimeTotal: 220_000 },
        both
      )
    ).toBe(true);
    expect(
      matchesCallQueueAssignFilters(
        { ...base, lifetimeTotal: 150_000 },
        both
      )
    ).toBe(false);
  });

  it("loyalty Gold alone uses computed tier (100k)", () => {
    expect(
      matchesLoyaltyFilter("gold", 120_000, null)
    ).toBe(true);
    expect(matchesLoyaltyFilter("gold", 80_000, null)).toBe(false);
    expect(matchesLoyaltyFilter("unassigned", 80_000, null)).toBe(true);
    expect(matchesLoyaltyFilter("unassigned", 80_000, "gold")).toBe(false);
    expect(matchesLoyaltyFilter("", 80_000, null)).toBe(true);
  });

  it("last purchase from-only, to-only, and range", () => {
    const at = new Date("2026-06-15T12:00:00.000Z");
    expect(matchesLastPurchaseRange(at, "2026-06-01", undefined)).toBe(true);
    expect(matchesLastPurchaseRange(at, "2026-07-01", undefined)).toBe(false);
    expect(matchesLastPurchaseRange(at, undefined, "2026-06-30")).toBe(true);
    expect(matchesLastPurchaseRange(at, undefined, "2026-06-01")).toBe(false);
    expect(matchesLastPurchaseRange(at, "2026-06-01", "2026-06-30")).toBe(true);
    expect(matchesLastPurchaseRange(null, "2026-06-01", undefined)).toBe(false);
    expect(matchesLastPurchaseRange(null, undefined, undefined)).toBe(true);
  });

  it("brand alone", () => {
    expect(
      matchesCallQueueAssignFilters(
        { ...base, boughtBrand: false },
        { brand: "Olaplex" }
      )
    ).toBe(false);
    expect(
      matchesCallQueueAssignFilters(
        { ...base, boughtBrand: true },
        { brand: "Olaplex" }
      )
    ).toBe(true);
  });

  it("combine push gold AND last purchase AND brand", () => {
    const filters = {
      pushToGold: true,
      lastPurchaseFrom: "2026-06-01",
      lastPurchaseTo: "2026-06-30",
      brand: "Olaplex",
    };
    expect(matchesCallQueueAssignFilters(base, filters)).toBe(true);
    expect(
      matchesCallQueueAssignFilters(
        { ...base, lastPurchaseAt: new Date("2026-01-01T00:00:00.000Z") },
        filters
      )
    ).toBe(false);
    expect(
      matchesCallQueueAssignFilters({ ...base, boughtBrand: false }, filters)
    ).toBe(false);
    expect(
      matchesCallQueueAssignFilters(
        { ...base, lifetimeTotal: 10_000 },
        filters
      )
    ).toBe(false);
  });

  it("unassigned loyalty does not need lifetime totals", () => {
    expect(callQueueNeedsLifetimeTotals({ loyalty: "unassigned" })).toBe(false);
    expect(callQueueNeedsLifetimeTotals({ loyalty: "gold" })).toBe(true);
    expect(callQueueNeedsLifetimeTotals({ pushToGold: true })).toBe(true);
  });

  it("loyalty Gold AND push gold → intersection (often empty)", () => {
    expect(
      matchesCallQueueAssignFilters(
        { ...base, lifetimeTotal: 80_000 },
        { pushToGold: true, loyalty: "gold" }
      )
    ).toBe(false);
    expect(
      matchesCallQueueAssignFilters(
        { ...base, lifetimeTotal: 100_000 },
        { pushToGold: true, loyalty: "gold" }
      )
    ).toBe(true);
  });
});
