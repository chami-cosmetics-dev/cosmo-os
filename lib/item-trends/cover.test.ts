import { describe, expect, it } from "vitest";

import { compareChannelKind, computeCoverMath } from "@/lib/item-trends/cover";

describe("computeCoverMath", () => {
  it("flags send when stock is below 50% of next-week need", () => {
    // 14 units in 7 days → avg 2/day → week need 14 → 50% = 7. Stock 3 → send 11.
    const result = computeCoverMath({ stockQty: 3, unitsInRange: 14, daysInRange: 7 });
    expect(result.avgDaily).toBe(2);
    expect(result.weekNeed).toBe(14);
    expect(result.minStock).toBe(7);
    expect(result.shouldSend).toBe(true);
    expect(result.suggestedSendQty).toBe(11);
    expect(result.coverDays).toBe(1.5);
    expect(result.isOosInRange).toBe(false);
  });

  it("does not flag when stock covers at least 50% of the week", () => {
    const result = computeCoverMath({ stockQty: 7, unitsInRange: 14, daysInRange: 7 });
    expect(result.shouldSend).toBe(false);
    expect(result.suggestedSendQty).toBe(0);
    expect(result.stockPctOfWeek).toBe(50);
  });

  it("skips send when there are no sales", () => {
    const result = computeCoverMath({ stockQty: 0, unitsInRange: 0, daysInRange: 7 });
    expect(result.shouldSend).toBe(false);
    expect(result.suggestedSendQty).toBe(0);
    expect(result.coverDays).toBeNull();
    expect(result.isOosInRange).toBe(false);
  });

  it("marks OOS when sold in range and stock is zero", () => {
    const result = computeCoverMath({ stockQty: 0, unitsInRange: 5, daysInRange: 10 });
    expect(result.isOosInRange).toBe(true);
    expect(result.shouldSend).toBe(true);
  });
});

describe("compareChannelKind", () => {
  it("sorts online before physical", () => {
    expect(compareChannelKind("online", "physical")).toBeLessThan(0);
    expect(compareChannelKind("physical", "online")).toBeGreaterThan(0);
  });
});
