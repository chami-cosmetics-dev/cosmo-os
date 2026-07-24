import { describe, expect, it } from "vitest";

import {
  addUtcDays,
  matchesPriorityFilter,
  resolveAssistWindow,
  roundHalfUp,
  suggestedRopFromSales,
} from "@/lib/osf/assist-window";

describe("resolveAssistWindow", () => {
  it("uses purchase date when <= asOf", () => {
    const w = resolveAssistWindow({
      asOfDate: "2026-07-24",
      lastPurchaseDate: "2026-07-10",
    });
    expect(w.windowStart).toBe("2026-07-10");
    expect(w.windowEnd).toBe("2026-07-24");
    expect(w.usedPurchaseDate).toBe(true);
  });

  it("falls back to last 30 days when no purchase date", () => {
    const w = resolveAssistWindow({
      asOfDate: "2026-07-24",
      lastPurchaseDate: null,
    });
    expect(w.windowStart).toBe("2026-06-24");
    expect(w.windowEnd).toBe("2026-07-24");
    expect(w.usedPurchaseDate).toBe(false);
  });

  it("falls back when purchase date is in the future", () => {
    const w = resolveAssistWindow({
      asOfDate: "2026-07-24",
      lastPurchaseDate: "2026-08-01",
    });
    expect(w.windowStart).toBe("2026-06-24");
    expect(w.usedPurchaseDate).toBe(false);
  });

  it("falls back when purchase date invalid", () => {
    const w = resolveAssistWindow({
      asOfDate: "2026-07-24",
      lastPurchaseDate: "not-a-date",
    });
    expect(w.windowStart).toBe(addUtcDays("2026-07-24", -30));
    expect(w.usedPurchaseDate).toBe(false);
  });
});

describe("suggestedRopFromSales / roundHalfUp", () => {
  it("rounds .5 up", () => {
    expect(roundHalfUp(12.5)).toBe(13);
    expect(suggestedRopFromSales(12.5)).toBe(13);
  });

  it("zero sales → 0", () => {
    expect(suggestedRopFromSales(0)).toBe(0);
  });

  it("null/negative treated as 0", () => {
    expect(suggestedRopFromSales(null)).toBe(0);
    expect(suggestedRopFromSales(-3)).toBe(0);
  });
});

describe("matchesPriorityFilter", () => {
  it("matches either ERP field", () => {
    expect(matchesPriorityFilter("Top Priority", "Newly Added", "Top Priority")).toBe(true);
    expect(matchesPriorityFilter("Newly Added", "Top Priority", "Top Priority")).toBe(true);
  });

  it("all / empty passes", () => {
    expect(matchesPriorityFilter("x", "y", "all")).toBe(true);
    expect(matchesPriorityFilter("x", "y", "")).toBe(true);
  });
});
