import { describe, expect, it } from "vitest";

import {
  buildMerchantSalesInsights,
  type InsightsSourceOrder,
} from "@/lib/page-data/merchant-dashboard-sales-insights";

function row(
  partial: Partial<InsightsSourceOrder> & Pick<InsightsSourceOrder, "amount" | "createdYmd">,
): InsightsSourceOrder {
  return {
    eligible: true,
    deliveredYmd: null,
    cancelledYmd: null,
    ...partial,
  };
}

describe("buildMerchantSalesInsights", () => {
  it("covers the current month plus two past months, one row per day", () => {
    const insights = buildMerchantSalesInsights({ todayYmd: "2026-01-14", orders: [] });
    expect(insights.windowFromYmd).toBe("2025-11-01");
    expect(insights.days[0].ymd).toBe("2025-11-01");
    expect(insights.days[insights.days.length - 1].ymd).toBe("2026-01-14");
    expect(insights.days).toHaveLength(30 + 31 + 14);
  });

  it("splits invoice vs delivered basis by their own dates", () => {
    const insights = buildMerchantSalesInsights({
      todayYmd: "2026-10-14",
      orders: [
        // Invoiced in Sept, delivered in Oct.
        row({ amount: 1000, createdYmd: "2026-09-28", deliveredYmd: "2026-10-02" }),
        // Invoiced today, not delivered yet.
        row({ amount: 500, createdYmd: "2026-10-14" }),
        // Before the window: ignored.
        row({ amount: 300, createdYmd: "2026-07-20", deliveredYmd: "2026-07-20" }),
      ],
    });
    const day = (ymd: string) => insights.days.find((d) => d.ymd === ymd)!;
    expect(day("2026-09-28").invoice).toEqual({ total: 1000, orderCount: 1 });
    expect(day("2026-09-28").delivered).toEqual({ total: 0, orderCount: 0 });
    expect(day("2026-10-02").delivered).toEqual({ total: 1000, orderCount: 1 });
    expect(day("2026-10-14").invoice).toEqual({ total: 500, orderCount: 1 });
    const allInvoice = insights.days.reduce((sum, d) => sum + d.invoice.total, 0);
    expect(allInvoice).toBe(1500);
  });

  it("counts cancellations by cancel day for today and MTD", () => {
    const insights = buildMerchantSalesInsights({
      todayYmd: "2026-10-14",
      orders: [
        row({ amount: 200, createdYmd: "2026-09-30", eligible: false, cancelledYmd: "2026-10-01" }),
        row({ amount: 400, createdYmd: "2026-10-14", eligible: false, cancelledYmd: "2026-10-14" }),
        row({ amount: 900, createdYmd: "2026-09-10", eligible: false, cancelledYmd: "2026-09-11" }),
      ],
    });
    expect(insights.cancelled.today).toEqual({ total: 400, orderCount: 1 });
    expect(insights.cancelled.mtd).toEqual({ total: 600, orderCount: 2 });
    expect(insights.days.every((d) => d.invoice.orderCount === 0)).toBe(true);
  });
});
