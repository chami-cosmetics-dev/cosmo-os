import { describe, expect, it } from "vitest";

import { peakMonthSales, suggestedRopFromPeakMonth } from "@/lib/item-trends/rop-formula";

describe("peakMonthSales", () => {
  it("picks the highest month, not the window total", () => {
    const monthly = new Map([
      ["2026-06", 4000],
      ["2026-07", 1000],
      ["2026-08", 8000],
    ]);
    expect(peakMonthSales(monthly)).toEqual({
      peakMonthSales: 8000,
      peakMonth: "2026-08",
      windowSales: 13000,
    });
    expect(suggestedRopFromPeakMonth(8000)).toBe(16000);
  });

  it("returns zeros when no monthly sales", () => {
    expect(peakMonthSales(undefined)).toEqual({
      peakMonthSales: 0,
      peakMonth: null,
      windowSales: 0,
    });
    expect(suggestedRopFromPeakMonth(0)).toBe(0);
  });
});
