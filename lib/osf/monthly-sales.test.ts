import { describe, expect, it } from "vitest";

import { attributedSalesMonth, monthKeyInColombo, salesMonthBounds } from "@/lib/osf/monthly-sales";

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
});
