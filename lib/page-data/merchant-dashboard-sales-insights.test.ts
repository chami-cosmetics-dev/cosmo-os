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
  it("lists current month plus three back, newest first", () => {
    const insights = buildMerchantSalesInsights({ todayYmd: "2026-01-14", orders: [] });
    expect(insights.months.map((m) => m.yearMonth)).toEqual([
      "2026-01",
      "2025-12",
      "2025-11",
      "2025-10",
    ]);
    expect(insights.dayOfMonth).toBe(14);
  });

  it("splits invoice vs delivered basis by their own dates", () => {
    const insights = buildMerchantSalesInsights({
      todayYmd: "2026-10-14",
      orders: [
        // Invoiced in Sept, delivered in Oct.
        row({ amount: 1000, createdYmd: "2026-09-28", deliveredYmd: "2026-10-02" }),
        // Invoiced today, not delivered yet.
        row({ amount: 500, createdYmd: "2026-10-14" }),
        // Late Sept sale outside the same-period window.
        row({ amount: 300, createdYmd: "2026-09-20", deliveredYmd: "2026-09-20" }),
      ],
    });
    const [oct, sep] = insights.months;
    expect(oct.invoice).toEqual({ total: 500, orderCount: 1 });
    expect(oct.delivered).toEqual({ total: 1000, orderCount: 1 });
    expect(sep.invoice).toEqual({ total: 1300, orderCount: 2 });
    expect(sep.invoiceToDate).toEqual({ total: 0, orderCount: 0 });
    expect(sep.delivered).toEqual({ total: 300, orderCount: 1 });
    expect(insights.today.invoice).toEqual({ total: 500, orderCount: 1 });
    expect(insights.today.delivered).toEqual({ total: 0, orderCount: 0 });
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
    expect(insights.months[0].invoice).toEqual({ total: 0, orderCount: 0 });
  });
});
