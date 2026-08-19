import { describe, expect, it } from "vitest";

import {
  hasNoPurchaseInDateRange,
  hasNoPurchaseWithinMonths,
  matchesBirthdayRange,
  matchesBirthdayThisMonth,
  mergeRankedSpendMaps,
  monthDayKey,
} from "@/lib/customer-insight/filters";
import {
  canAssignLoyaltyTier,
  isLoyaltyEligibleByTotal,
  nextOutreachStatus,
  suggestedLoyaltyTier,
} from "@/lib/customer-insight/loyalty-outreach";

describe("matchesBirthdayThisMonth", () => {
  it("matches current calendar month", () => {
    const aug = new Date("2026-08-15T12:00:00Z");
    expect(matchesBirthdayThisMonth(8, aug)).toBe(true);
    expect(matchesBirthdayThisMonth(7, aug)).toBe(false);
  });
});

describe("matchesBirthdayRange", () => {
  it("matches inclusive non-wrap range", () => {
    expect(
      matchesBirthdayRange(8, 12, { month: 8, day: 1 }, { month: 8, day: 31 })
    ).toBe(true);
    expect(
      matchesBirthdayRange(9, 1, { month: 8, day: 1 }, { month: 8, day: 31 })
    ).toBe(false);
  });

  it("supports year wrap", () => {
    expect(
      matchesBirthdayRange(12, 25, { month: 12, day: 20 }, { month: 1, day: 5 })
    ).toBe(true);
    expect(
      matchesBirthdayRange(1, 3, { month: 12, day: 20 }, { month: 1, day: 5 })
    ).toBe(true);
    expect(
      matchesBirthdayRange(6, 1, { month: 12, day: 20 }, { month: 1, day: 5 })
    ).toBe(false);
  });
});

describe("monthDayKey", () => {
  it("orders months", () => {
    expect(monthDayKey(1, 1)).toBeLessThan(monthDayKey(12, 31));
  });
});

describe("hasNoPurchaseWithinMonths", () => {
  const now = new Date("2026-08-11T06:00:00.000Z");
  it("treats never-purchased as inactive", () => {
    expect(hasNoPurchaseWithinMonths(null, 3, now)).toBe(true);
  });
});

describe("hasNoPurchaseInDateRange", () => {
  it("true when last purchase outside window", () => {
    expect(
      hasNoPurchaseInDateRange(
        new Date("2026-01-01T00:00:00+05:30"),
        "2026-06-01",
        "2026-06-30"
      )
    ).toBe(true);
  });
  it("false when purchase inside window", () => {
    expect(
      hasNoPurchaseInDateRange(
        new Date("2026-06-15T12:00:00+05:30"),
        "2026-06-01",
        "2026-06-30"
      )
    ).toBe(false);
  });
});

describe("loyalty outreach", () => {
  it("eligibility and assign bands use 100k/250k", () => {
    expect(isLoyaltyEligibleByTotal(99_999)).toBe(false);
    expect(isLoyaltyEligibleByTotal(100_000)).toBe(true);
    expect(suggestedLoyaltyTier(120_000)).toBe("gold");
    expect(suggestedLoyaltyTier(250_000)).toBe("platinum");
    expect(canAssignLoyaltyTier("gold", 120_000)).toBe(true);
    expect(canAssignLoyaltyTier("gold", 250_000)).toBe(false);
    expect(canAssignLoyaltyTier("platinum", 250_000)).toBe(true);
  });

  it("maps actions to status", () => {
    expect(nextOutreachStatus("loyalty_informed")).toBe("contacted");
    expect(nextOutreachStatus("responded")).toBe("responded");
    expect(nextOutreachStatus("not_responded")).toBe("not_responded");
  });
});

describe("mergeRankedSpendMaps", () => {
  it("unions contacts across brands (OR), not intersection", () => {
    const merged = mergeRankedSpendMaps([
      [{ contactId: "a", spend: 10 }],
      [
        { contactId: "b", spend: 5 },
        { contactId: "a", spend: 3 },
      ],
    ]);
    expect(merged.sortedContactIds).toEqual(["a", "b"]);
    expect(merged.spendById.get("a")).toBe(13);
    expect(merged.spendById.get("b")).toBe(5);
  });

  it("keeps a contact who bought only one of the selected brands", () => {
    const merged = mergeRankedSpendMaps([
      [{ contactId: "anua-only", spend: 1 }],
      [{ contactId: "cosrx-only", spend: 99 }],
    ]);
    expect(merged.sortedContactIds).toEqual(["cosrx-only", "anua-only"]);
  });
});
