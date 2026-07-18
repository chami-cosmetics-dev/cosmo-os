import { describe, expect, it } from "vitest";

import { isDashboardSalesOrderEligible } from "@/lib/page-data/dashboard-sales";

describe("isDashboardSalesOrderEligible", () => {
  it("counts paid and pending for order-date sales", () => {
    expect(
      isDashboardSalesOrderEligible({ financialStatus: "paid" }, "order"),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible({ financialStatus: "pending" }, "order"),
    ).toBe(true);
  });

  it("excludes voided orders from order-date sales (rejected finance orders)", () => {
    expect(
      isDashboardSalesOrderEligible({ financialStatus: "voided" }, "order"),
    ).toBe(false);
    expect(
      isDashboardSalesOrderEligible({ financialStatus: "VOIDED" }, "order"),
    ).toBe(false);
  });
});
