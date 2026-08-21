import { describe, expect, it } from "vitest";

import { getMerchantPeerCheerMessage } from "@/lib/merchant-dashboard/cheer";
import {
  buildDailyHistoryRows,
  buildMonthlyHistoryStatus,
  listDaysThroughToday,
  listLastYearMonths,
} from "@/lib/page-data/merchant-dashboard-history";

describe("listLastYearMonths", () => {
  it("returns 3 months ending at current", () => {
    expect(listLastYearMonths("2026-08", 3)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });
});

describe("listDaysThroughToday", () => {
  it("lists from month start through today", () => {
    const days = listDaysThroughToday("2026-08", "2026-08-03");
    expect(days).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });
});

describe("buildDailyHistoryRows", () => {
  it("fills zero days", () => {
    const byDay = new Map([["2026-08-02", { total: 100, orderCount: 1 }]]);
    const rows = buildDailyHistoryRows("2026-08", "2026-08-03", byDay);
    expect(rows).toEqual([
      { ymd: "2026-08-01", total: 0, orderCount: 0, callCount: 0 },
      { ymd: "2026-08-02", total: 100, orderCount: 1, callCount: 0 },
      { ymd: "2026-08-03", total: 0, orderCount: 0, callCount: 0 },
    ]);
  });

  it("merges call counts by day", () => {
    const byDay = new Map([["2026-08-01", { total: 50, orderCount: 1 }]]);
    const calls = new Map([
      ["2026-08-01", 4],
      ["2026-08-02", 2],
    ]);
    const rows = buildDailyHistoryRows("2026-08", "2026-08-02", byDay, calls);
    expect(rows).toEqual([
      { ymd: "2026-08-01", total: 50, orderCount: 1, callCount: 4 },
      { ymd: "2026-08-02", total: 0, orderCount: 0, callCount: 2 },
    ]);
  });
});

describe("buildMonthlyHistoryStatus", () => {
  it("marks achieved / on_track / missed / no_target", () => {
    expect(
      buildMonthlyHistoryStatus({
        achieved: 120,
        targetAmount: 100,
        yearMonth: "2026-07",
        currentYearMonth: "2026-08",
      }).status,
    ).toBe("achieved");
    expect(
      buildMonthlyHistoryStatus({
        achieved: 50,
        targetAmount: 100,
        yearMonth: "2026-08",
        currentYearMonth: "2026-08",
      }).status,
    ).toBe("on_track");
    expect(
      buildMonthlyHistoryStatus({
        achieved: 50,
        targetAmount: 100,
        yearMonth: "2026-07",
        currentYearMonth: "2026-08",
      }).status,
    ).toBe("missed");
    expect(
      buildMonthlyHistoryStatus({
        achieved: 50,
        targetAmount: null,
        yearMonth: "2026-08",
        currentYearMonth: "2026-08",
      }).status,
    ).toBe("no_target");
  });
});

describe("getMerchantPeerCheerMessage", () => {
  it("returns non-empty encouraging copy for each band", () => {
    for (const band of [
      "leader",
      "chasing",
      "mid",
      "behind",
      "no_sales",
      "solo",
    ] as const) {
      const msg = getMerchantPeerCheerMessage(band, "Ada");
      expect(msg.length).toBeGreaterThan(10);
      expect(msg.toLowerCase()).not.toMatch(/fail|loser|shame|pathetic/);
    }
  });
});
