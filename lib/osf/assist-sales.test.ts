import { describe, expect, it } from "vitest";

import { colomboDayStartUtc, resolveAssistWindow } from "@/lib/osf/assist-window";

describe("assist sales range bounds", () => {
  it("range end is exclusive next Colombo day", () => {
    const w = resolveAssistWindow({
      asOfDate: "2026-07-24",
      lastPurchaseDate: "2026-07-10",
    });
    expect(w.rangeStart.getTime()).toBe(colomboDayStartUtc("2026-07-10").getTime());
    expect(w.rangeEndExclusive.getTime()).toBe(colomboDayStartUtc("2026-07-25").getTime());
  });

  it("30-day fallback range starts 30 calendar days before asOf", () => {
    const w = resolveAssistWindow({
      asOfDate: "2026-07-24",
      lastPurchaseDate: null,
    });
    expect(w.rangeStart.getTime()).toBe(colomboDayStartUtc("2026-06-24").getTime());
  });
});
