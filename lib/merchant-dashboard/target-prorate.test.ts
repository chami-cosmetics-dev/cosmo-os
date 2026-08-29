import { describe, expect, it } from "vitest";

import {
  countWorkingDaysBetween,
  countWorkingDaysInMonth,
  dailyWorkingTarget,
  isWorkingDayYmd,
  prorateMonthlyTargetForPeriod,
} from "@/lib/merchant-dashboard/target-prorate";

describe("isWorkingDayYmd", () => {
  it("treats Sunday as non-working", () => {
    expect(isWorkingDayYmd("2026-08-02")).toBe(false);
  });

  it("treats Monday as working", () => {
    expect(isWorkingDayYmd("2026-08-03")).toBe(true);
  });
});

describe("countWorkingDaysInMonth", () => {
  it("counts Mon–Sat in August 2026", () => {
    expect(countWorkingDaysInMonth("2026-08")).toBe(26);
  });
});

describe("prorateMonthlyTargetForPeriod", () => {
  const monthly = 2_600_000;

  it("returns one day share for Today", () => {
    const monday = "2026-08-03";
    const prorated = prorateMonthlyTargetForPeriod({
      monthlyTarget: monthly,
      yearMonth: "2026-08",
      fromYmd: monday,
      toYmd: monday,
    });
    expect(prorated).toBe(dailyWorkingTarget(monthly, "2026-08"));
  });

  it("returns null on Sunday-only day", () => {
    expect(
      prorateMonthlyTargetForPeriod({
        monthlyTarget: monthly,
        yearMonth: "2026-08",
        fromYmd: "2026-08-02",
        toYmd: "2026-08-02",
      }),
    ).toBeNull();
  });

  it("scales with working days elapsed MTD", () => {
    const mtdThrough15 = prorateMonthlyTargetForPeriod({
      monthlyTarget: monthly,
      yearMonth: "2026-08",
      fromYmd: "2026-08-01",
      toYmd: "2026-08-15",
    });
    const working = countWorkingDaysBetween("2026-08-01", "2026-08-15");
    const monthWorking = countWorkingDaysInMonth("2026-08");
    expect(mtdThrough15).toBe(
      Math.round(((monthly * working) / monthWorking) * 100) / 100,
    );
  });
});
