import { describe, expect, it } from "vitest";

import { matchesBirthdayThisMonth } from "@/lib/customer-insight/filters";
import { isPushToGold, isPushToPlatinum } from "@/lib/customer-insight/loyalty-tier";

describe("matchesBirthdayThisMonth", () => {
  it("matches current calendar month", () => {
    const aug = new Date("2026-08-15T12:00:00Z");
    expect(matchesBirthdayThisMonth(8, aug)).toBe(true);
    expect(matchesBirthdayThisMonth(7, aug)).toBe(false);
    expect(matchesBirthdayThisMonth(null, aug)).toBe(false);
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
