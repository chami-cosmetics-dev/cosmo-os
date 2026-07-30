import { describe, expect, it } from "vitest";

import {
  isValidPaydayDayOfMonth,
  mostRecentPaydayOnOrBefore,
  resolvePayPeriodWindow,
} from "@/lib/rider-pay-period";

describe("isValidPaydayDayOfMonth", () => {
  it("accepts 1–28 only", () => {
    expect(isValidPaydayDayOfMonth(1)).toBe(true);
    expect(isValidPaydayDayOfMonth(28)).toBe(true);
    expect(isValidPaydayDayOfMonth(null)).toBe(false);
    expect(isValidPaydayDayOfMonth(29)).toBe(false);
    expect(isValidPaydayDayOfMonth(0)).toBe(false);
  });
});

describe("mostRecentPaydayOnOrBefore", () => {
  it("uses today when today is payday", () => {
    const ref = new Date(2026, 6, 25, 15, 0, 0); // Jul 25 2026 local
    const start = mostRecentPaydayOnOrBefore(ref, 25);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(25);
    expect(start.getHours()).toBe(0);
  });

  it("rolls to previous month before payday", () => {
    const ref = new Date(2026, 7, 10, 12, 0, 0); // Aug 10
    const start = mostRecentPaydayOnOrBefore(ref, 25);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(6);
    expect(start.getDate()).toBe(25);
  });
});

describe("resolvePayPeriodWindow", () => {
  it("returns null when payday unset", () => {
    expect(resolvePayPeriodWindow(null, "current")).toBeNull();
  });

  it("builds current window D through day before next D", () => {
    const ref = new Date(2026, 7, 1, 9, 0, 0); // Aug 1 → period Jul 25–Aug 24
    const window = resolvePayPeriodWindow(25, "current", ref);
    expect(window).not.toBeNull();
    expect(window!.kind).toBe("current");
    expect(window!.from.getDate()).toBe(25);
    expect(window!.from.getMonth()).toBe(6);
    expect(window!.to.getDate()).toBe(24);
    expect(window!.to.getMonth()).toBe(7);
    expect(window!.to.getHours()).toBe(23);
  });

  it("builds previous window immediately before current", () => {
    const ref = new Date(2026, 7, 1, 9, 0, 0);
    const previous = resolvePayPeriodWindow(25, "previous", ref);
    expect(previous).not.toBeNull();
    expect(previous!.from.getDate()).toBe(25);
    expect(previous!.from.getMonth()).toBe(5); // Jun
    expect(previous!.to.getDate()).toBe(24);
    expect(previous!.to.getMonth()).toBe(6); // jul
  });

  it("includes completions on payday in the new period", () => {
    const onPayday = new Date(2026, 6, 25, 10, 0, 0);
    const window = resolvePayPeriodWindow(25, "current", onPayday)!;
    expect(window.from.getTime()).toBeLessThanOrEqual(onPayday.getTime());
    expect(window.to.getTime()).toBeGreaterThan(onPayday.getTime());
  });
});
