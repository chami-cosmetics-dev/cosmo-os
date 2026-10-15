import { describe, expect, it } from "vitest";

import { computeMovementFields, countByMovement } from "@/lib/item-trends/stock-trend-movement";
import { EARLY_AGE_DAYS, FAST_MOVER_SELL_THROUGH_PCT } from "@/lib/item-trends/stock-trends-config";

const TODAY = "2026-10-07";

/** createdDate exactly `days` before TODAY. */
function createdDaysAgo(days: number): string {
  const d = new Date(Date.UTC(2026, 9, 7) - days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

describe("computeMovementFields", () => {
  it("uses the configured thresholds", () => {
    expect(FAST_MOVER_SELL_THROUGH_PCT).toBe(50);
    expect(EARLY_AGE_DAYS).toBe(30);
  });

  it("is na with null sell-through when nothing was purchased, even if young or selling", () => {
    const result = computeMovementFields(
      { createdDate: createdDaysAgo(5), unitsPurchased: 0, unitsSold: 10 },
      TODAY,
    );
    expect(result).toEqual({ ageDays: 5, sellThroughPct: null, movementStatus: "na" });
  });

  it("is early at age 29 and no longer early at age 30", () => {
    const young = computeMovementFields({ createdDate: createdDaysAgo(29), unitsPurchased: 10, unitsSold: 9 }, TODAY);
    expect(young.ageDays).toBe(29);
    expect(young.movementStatus).toBe("early");

    const thirty = computeMovementFields({ createdDate: createdDaysAgo(30), unitsPurchased: 10, unitsSold: 9 }, TODAY);
    expect(thirty.ageDays).toBe(30);
    expect(thirty.movementStatus).toBe("fast");
  });

  it("is slow at 49.9% sell-through and fast at exactly 50%", () => {
    const created = createdDaysAgo(60);
    const slow = computeMovementFields({ createdDate: created, unitsPurchased: 1000, unitsSold: 499 }, TODAY);
    expect(slow.sellThroughPct).toBeCloseTo(49.9);
    expect(slow.movementStatus).toBe("slow");

    const fast = computeMovementFields({ createdDate: created, unitsPurchased: 1000, unitsSold: 500 }, TODAY);
    expect(fast.sellThroughPct).toBe(50);
    expect(fast.movementStatus).toBe("fast");
  });

  it("returns null ageDays without a createdDate and skips the early rule", () => {
    const result = computeMovementFields({ createdDate: null, unitsPurchased: 10, unitsSold: 1 }, TODAY);
    expect(result).toEqual({ ageDays: null, sellThroughPct: 10, movementStatus: "slow" });
  });
});

describe("countByMovement", () => {
  it("counts every status, zero-filling missing ones", () => {
    expect(
      countByMovement([{ movementStatus: "fast" }, { movementStatus: "fast" }, { movementStatus: "early" }]),
    ).toEqual({ fast: 2, slow: 0, early: 1, na: 0 });
  });
});
