import { describe, expect, it } from "vitest";

import {
  buildGmAlerts,
  computeHealthStatus,
  computeInterestedPct,
  getExpectedPacePercent,
  getPaceStatus,
} from "@/lib/merchant-dashboard/gm-score";

describe("getExpectedPacePercent", () => {
  it("returns day progress through month", () => {
    expect(getExpectedPacePercent("2026-08", "2026-08-15")).toBe(48.4);
  });

  it("returns null when today is outside month", () => {
    expect(getExpectedPacePercent("2026-07", "2026-08-01")).toBeNull();
  });
});

describe("getPaceStatus", () => {
  it("marks behind when well under expected pace", () => {
    expect(
      getPaceStatus({ targetPercent: 30, expectedPacePercent: 50 }),
    ).toBe("behind");
  });

  it("marks ahead when well over expected pace", () => {
    expect(
      getPaceStatus({ targetPercent: 80, expectedPacePercent: 50 }),
    ).toBe("ahead");
  });
});

describe("computeInterestedPct", () => {
  it("returns null when no calls", () => {
    expect(computeInterestedPct({ interestedCount: 0, totalCalls: 0 })).toBeNull();
  });

  it("computes percentage", () => {
    expect(computeInterestedPct({ interestedCount: 2, totalCalls: 10 })).toBe(20);
  });
});

describe("computeHealthStatus", () => {
  it("returns green for strong performer", () => {
    expect(
      computeHealthStatus({
        targetPercent: 90,
        expectedPacePercent: 50,
        callsToday: 30,
        callsMtd: 400,
        interestedPct: 20,
        returnRatePct: 2,
        pendingQueueCount: 0,
        isCurrentMonth: true,
      }),
    ).toBe("green");
  });

  it("returns red for weak performer", () => {
    expect(
      computeHealthStatus({
        targetPercent: 20,
        expectedPacePercent: 60,
        callsToday: 0,
        callsMtd: 5,
        interestedPct: 2,
        returnRatePct: 12,
        pendingQueueCount: 15,
        isCurrentMonth: true,
      }),
    ).toBe("red");
  });
});

describe("buildGmAlerts", () => {
  it("flags behind pace and no calls", () => {
    const alerts = buildGmAlerts({
      merchantId: "m1",
      displayName: "Amal",
      targetPercent: 25,
      expectedPacePercent: 50,
      callsToday: 0,
      interestedCount: 0,
      returnRatePct: null,
      pendingQueueCount: 0,
      isCurrentMonth: true,
    });
    expect(alerts.some((a) => a.severity === "critical")).toBe(true);
    expect(alerts.some((a) => a.message.includes("No calls"))).toBe(true);
  });
});
