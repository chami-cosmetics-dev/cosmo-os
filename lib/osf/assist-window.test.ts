import { describe, expect, it } from "vitest";

import {
  addUtcDays,
  matchesPriorityFilter,
  resolveAssistWindow,
  resolveProductPriority,
  roundHalfUp,
  suggestedRopFromSales,
} from "@/lib/osf/assist-window";

describe("resolveAssistWindow", () => {
  it("always uses last 30 days ending on asOf", () => {
    const w = resolveAssistWindow({
      asOfDate: "2026-07-24",
      lastPurchaseDate: "2026-07-10",
    });
    expect(w.windowStart).toBe("2026-06-24");
    expect(w.windowEnd).toBe("2026-07-24");
    expect(w.usedPurchaseDate).toBe(false);
  });

  it("uses last 30 days when no purchase date", () => {
    const w = resolveAssistWindow({
      asOfDate: "2026-07-24",
      lastPurchaseDate: null,
    });
    expect(w.windowStart).toBe("2026-06-24");
    expect(w.windowEnd).toBe("2026-07-24");
    expect(w.usedPurchaseDate).toBe(false);
  });

  it("ignores future purchase date (still 30 days)", () => {
    const w = resolveAssistWindow({
      asOfDate: "2026-07-24",
      lastPurchaseDate: "2026-08-01",
    });
    expect(w.windowStart).toBe("2026-06-24");
    expect(w.usedPurchaseDate).toBe(false);
  });

  it("ignores invalid purchase date (still 30 days)", () => {
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

describe("resolveProductPriority", () => {
  it("prefers erp1 when set", () => {
    expect(resolveProductPriority("Top", "Low")).toBe("Top");
  });

  it("falls back to erp2 when erp1 is empty/null", () => {
    expect(resolveProductPriority(null, "Low")).toBe("Low");
    expect(resolveProductPriority("", "Low")).toBe("Low");
    expect(resolveProductPriority("   ", "Low")).toBe("Low");
  });

  it("returns null when neither is set — no invented fallback string", () => {
    expect(resolveProductPriority(null, null)).toBeNull();
    expect(resolveProductPriority("", "")).toBeNull();
  });
});
