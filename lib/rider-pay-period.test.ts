import { describe, expect, it } from "vitest";

import { lastDayOfCalendarMonth, resolvePayPeriodWindow } from "@/lib/rider-pay-period";

describe("lastDayOfCalendarMonth", () => {
  it("handles short months and leap Feb", () => {
    expect(lastDayOfCalendarMonth(2026, 2)).toBe(28);
    expect(lastDayOfCalendarMonth(2024, 2)).toBe(29);
    expect(lastDayOfCalendarMonth(2026, 4)).toBe(30);
    expect(lastDayOfCalendarMonth(2026, 1)).toBe(31);
  });
});

describe("resolvePayPeriodWindow", () => {
  it("current = 1st through last day of Colombo month", () => {
    // 2026-08-15 10:00 UTC = 15:30 Colombo → August
    const ref = new Date("2026-08-15T10:00:00.000Z");
    const window = resolvePayPeriodWindow("current", ref);
    expect(window.kind).toBe("current");
    expect(window.from.toISOString()).toBe("2026-07-31T18:30:00.000Z"); // Aug 1 00:00 +05:30
    expect(window.to.toISOString()).toBe("2026-08-31T18:29:59.999Z"); // Aug 31 23:59:59.999 +05:30
  });

  it("previous = prior calendar month", () => {
    const ref = new Date("2026-08-15T10:00:00.000Z");
    const previous = resolvePayPeriodWindow("previous", ref);
    expect(previous.from.toISOString()).toBe("2026-06-30T18:30:00.000Z"); // Jul 1
    expect(previous.to.toISOString()).toBe("2026-07-31T18:29:59.999Z"); // Jul 31 end
  });

  it("February non-leap ends on 28", () => {
    const ref = new Date("2026-02-10T10:00:00.000Z");
    const window = resolvePayPeriodWindow("current", ref);
    expect(window.from.toISOString()).toBe("2026-01-31T18:30:00.000Z");
    expect(window.to.toISOString()).toBe("2026-02-28T18:29:59.999Z");
  });

  it("January previous rolls to December prior year", () => {
    const ref = new Date("2026-01-05T10:00:00.000Z");
    const previous = resolvePayPeriodWindow("previous", ref);
    expect(previous.from.toISOString()).toBe("2025-11-30T18:30:00.000Z");
    expect(previous.to.toISOString()).toBe("2025-12-31T18:29:59.999Z");
  });
});
