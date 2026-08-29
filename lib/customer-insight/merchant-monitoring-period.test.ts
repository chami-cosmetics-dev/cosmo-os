import { describe, expect, it } from "vitest";

import {
  MerchantMonitoringPeriodError,
  defaultMtdPeriod,
  resolveMerchantMonitoringPeriod,
} from "@/lib/customer-insight/merchant-monitoring-period";

const TODAY = "2026-08-29";

describe("resolveMerchantMonitoringPeriod", () => {
  it("clamps future toYmd to today", () => {
    const period = resolveMerchantMonitoringPeriod({
      fromYmd: "2026-08-01",
      toYmd: "2026-09-01",
      todayYmd: TODAY,
    });
    expect(period.toYmd).toBe(TODAY);
    expect(period.periodEndYmd).toBe(TODAY);
  });

  it("rejects from after to", () => {
    expect(() =>
      resolveMerchantMonitoringPeriod({
        fromYmd: "2026-08-10",
        toYmd: "2026-08-01",
        todayYmd: TODAY,
      })
    ).toThrow(MerchantMonitoringPeriodError);
  });

  it("labels today preset", () => {
    const period = resolveMerchantMonitoringPeriod({
      fromYmd: TODAY,
      toYmd: TODAY,
      todayYmd: TODAY,
    });
    expect(period.preset).toBe("today");
    expect(period.periodLabel).toBe("Today");
  });

  it("labels mtd preset", () => {
    const period = resolveMerchantMonitoringPeriod({
      fromYmd: "2026-08-01",
      toYmd: TODAY,
      todayYmd: TODAY,
    });
    expect(period.preset).toBe("mtd");
    expect(period.periodLabel).toBe("MTD");
  });
});

describe("defaultMtdPeriod", () => {
  it("uses month start through today", () => {
    const period = defaultMtdPeriod(TODAY);
    expect(period.fromYmd).toBe("2026-08-01");
    expect(period.toYmd).toBe(TODAY);
  });
});
