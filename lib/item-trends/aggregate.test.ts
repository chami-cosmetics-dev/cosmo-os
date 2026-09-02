import { describe, expect, it } from "vitest";

import {
  calendarDaysInclusive,
  percentChange,
  resolveItemTrendWindows,
  speedPerDay,
} from "@/lib/item-trends/aggregate";

describe("item-trends aggregate", () => {
  it("computes inclusive calendar days", () => {
    expect(calendarDaysInclusive("2026-09-01", "2026-09-07")).toBe(7);
    expect(calendarDaysInclusive("2026-09-01", "2026-09-01")).toBe(1);
  });

  it("derives prior equal-length comparison window", () => {
    const { current, prior } = resolveItemTrendWindows({
      fromYmd: "2026-09-01",
      toYmd: "2026-09-07",
    });
    expect(current.fromYmd).toBe("2026-09-01");
    expect(prior.toYmd).toBe("2026-08-31");
    expect(calendarDaysInclusive(prior.fromYmd, prior.toYmd)).toBe(7);
  });

  it("computes speed per day", () => {
    expect(speedPerDay(14, "2026-09-01", "2026-09-07")).toBe(2);
  });

  it("computes percent change", () => {
    expect(percentChange(12, 10)).toBe(20);
    expect(percentChange(0, 10)).toBe(-100);
    expect(percentChange(5, 0)).toBe(100);
  });
});
