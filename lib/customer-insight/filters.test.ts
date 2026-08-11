import { describe, expect, it } from "vitest";

import { matchesBirthdayThisMonth, hasNoPurchaseWithinMonths } from "@/lib/customer-insight/filters";
import { isPushToGold, isPushToPlatinum } from "@/lib/customer-insight/loyalty-tier";

describe("matchesBirthdayThisMonth", () => {
  it("matches current calendar month", () => {
    const aug = new Date("2026-08-15T12:00:00Z");
    expect(matchesBirthdayThisMonth(8, aug)).toBe(true);
    expect(matchesBirthdayThisMonth(7, aug)).toBe(false);
    expect(matchesBirthdayThisMonth(null, aug)).toBe(false);
  });
});

describe("hasNoPurchaseWithinMonths", () => {
  const now = new Date("2026-08-11T06:00:00.000Z");

  it("treats never-purchased as inactive", () => {
    expect(hasNoPurchaseWithinMonths(null, 3, now)).toBe(true);
    expect(hasNoPurchaseWithinMonths(null, 6, now)).toBe(true);
  });

  it("flags last purchase older than window", () => {
    expect(hasNoPurchaseWithinMonths(new Date("2026-04-01T00:00:00.000Z"), 3, now)).toBe(
      true,
    );
    expect(hasNoPurchaseWithinMonths(new Date("2026-01-01T00:00:00.000Z"), 6, now)).toBe(
      true,
    );
  });

  it("keeps recent buyers out of inactive filters", () => {
    expect(hasNoPurchaseWithinMonths(new Date("2026-07-01T00:00:00.000Z"), 3, now)).toBe(
      false,
    );
    expect(hasNoPurchaseWithinMonths(new Date("2026-04-01T00:00:00.000Z"), 6, now)).toBe(
      false,
    );
  });
});

describe("filter push bands (via loyalty helpers)", () => {
  it("aligns with Push Gold / Platinum", () => {
    expect(isPushToGold(75_000)).toBe(true);
    expect(isPushToGold(99_999)).toBe(true);
    expect(isPushToGold(100_000)).toBe(false);
    expect(isPushToPlatinum(200_000)).toBe(true);
    expect(isPushToPlatinum(249_999)).toBe(true);
    expect(isPushToPlatinum(250_000)).toBe(false);
  });
});
