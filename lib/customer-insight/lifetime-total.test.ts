import { describe, expect, it } from "vitest";

import {
  computeLifetimeTotal,
  sumAdaptTotals,
  sumEligibleOrderTotals,
} from "@/lib/customer-insight/lifetime-total";

describe("sumEligibleOrderTotals", () => {
  it("excludes cancelled orders", () => {
    const sum = sumEligibleOrderTotals([
      { totalPrice: 1000, cancelledAt: null },
      { totalPrice: 5000, cancelledAt: new Date() },
      { totalPrice: "2500.50", cancelledAt: null },
    ]);
    expect(sum).toBe(3500.5);
  });
});

describe("sumAdaptTotals", () => {
  it("includes all adapt amounts", () => {
    expect(sumAdaptTotals([{ ttlAmount: 100 }, { ttlAmount: "200" }])).toBe(300);
  });
});

describe("computeLifetimeTotal", () => {
  it("sums eligible orders and adapt", () => {
    expect(
      computeLifetimeTotal({
        orders: [
          { totalPrice: 100_000, cancelledAt: null },
          { totalPrice: 50_000, cancelledAt: new Date("2024-01-01") },
        ],
        adaptRows: [{ ttlAmount: 25_000 }],
      })
    ).toBe(125_000);
  });
});
