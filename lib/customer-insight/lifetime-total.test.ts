import { describe, expect, it } from "vitest";

import {
  computeLifetimeTotal,
  isOrderIncludedInCustomerLifetimeTotal,
  sumAdaptTotals,
  sumEligibleOrderTotals,
} from "@/lib/customer-insight/lifetime-total";

describe("isOrderIncludedInCustomerLifetimeTotal", () => {
  it("includes delivery_complete and invoice_complete", () => {
    expect(
      isOrderIncludedInCustomerLifetimeTotal({
        cancelledAt: null,
        fulfillmentStage: "delivery_complete",
      })
    ).toBe(true);
    expect(
      isOrderIncludedInCustomerLifetimeTotal({
        cancelledAt: null,
        fulfillmentStage: "invoice_complete",
      })
    ).toBe(true);
  });

  it("excludes voided, returned, cancelled, and in-progress stages", () => {
    expect(
      isOrderIncludedInCustomerLifetimeTotal({
        cancelledAt: null,
        financialStatus: "voided",
        fulfillmentStage: "invoice_complete",
      })
    ).toBe(false);
    expect(
      isOrderIncludedInCustomerLifetimeTotal({
        cancelledAt: null,
        fulfillmentStage: "returned",
      })
    ).toBe(false);
    expect(
      isOrderIncludedInCustomerLifetimeTotal({
        cancelledAt: new Date(),
        fulfillmentStage: "invoice_complete",
      })
    ).toBe(false);
    expect(
      isOrderIncludedInCustomerLifetimeTotal({
        cancelledAt: null,
        fulfillmentStage: "dispatched",
      })
    ).toBe(false);
  });
});

describe("sumEligibleOrderTotals", () => {
  it("sums only completed non-void orders", () => {
    const sum = sumEligibleOrderTotals([
      { totalPrice: 1000, cancelledAt: null, fulfillmentStage: "invoice_complete" },
      {
        totalPrice: 5000,
        cancelledAt: new Date(),
        fulfillmentStage: "invoice_complete",
      },
      { totalPrice: "2500.50", cancelledAt: null, fulfillmentStage: "delivery_complete" },
      { totalPrice: 900, cancelledAt: null, fulfillmentStage: "dispatched" },
      {
        totalPrice: 700,
        cancelledAt: null,
        financialStatus: "voided",
        fulfillmentStage: "invoice_complete",
      },
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
          {
            totalPrice: 100_000,
            cancelledAt: null,
            fulfillmentStage: "invoice_complete",
          },
          {
            totalPrice: 50_000,
            cancelledAt: new Date("2024-01-01"),
            fulfillmentStage: "invoice_complete",
          },
        ],
        adaptRows: [{ ttlAmount: 25_000 }],
      })
    ).toBe(125_000);
  });
});
