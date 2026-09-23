import { describe, expect, it } from "vitest";

import {
  attributedSalesMonth,
  monthKeyInColombo,
  osfPurchaseGridBounds,
  osfSalesGridBounds,
  salesMonthBounds,
} from "@/lib/osf/monthly-sales";

describe("monthly sales helpers", () => {
  it("bounds cover Colombo calendar month", () => {
    const { start, end } = salesMonthBounds("2026-06");
    expect(monthKeyInColombo(start)).toBe("2026-06");
    // end is exclusive first instant of next month
    expect(monthKeyInColombo(new Date(end.getTime() - 1))).toBe("2026-06");
    expect(monthKeyInColombo(end)).toBe("2026-07");
  });

  it("prefers deliveryCompleteAt over invoiceCompleteAt", () => {
    const delivery = new Date("2026-06-15T10:00:00+05:30");
    const invoice = new Date("2026-05-01T10:00:00+05:30");
    expect(attributedSalesMonth(delivery, invoice)).toBe("2026-06");
    expect(attributedSalesMonth(null, invoice)).toBe("2026-05");
    expect(attributedSalesMonth(null, null)).toBeNull();
  });

  it("sales grid window is April 1 through as-of next midnight Colombo", () => {
    const { start, endExclusive } = osfSalesGridBounds("2026-06-18");
    expect(monthKeyInColombo(start)).toBe("2026-04");
    expect(monthKeyInColombo(new Date(endExclusive.getTime() - 1))).toBe("2026-06");
    expect(osfPurchaseGridBounds("2026-06-18")).toEqual({
      start: "2026-04-01",
      end: "2026-06-18",
    });
  });
});
