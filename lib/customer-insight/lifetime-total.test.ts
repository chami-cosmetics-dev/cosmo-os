import { describe, expect, it } from "vitest";

import {
  attributeOrderTotalsByContact,
  combineLifetimeTotals,
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

describe("attributeOrderTotalsByContact", () => {
  it("matches phone contacts by phone only", () => {
    const totals = attributeOrderTotalsByContact({
      lookupByContactId: new Map([
        ["phone-c", { phones: ["0771111111"], emails: [] }],
        ["email-c", { phones: [], emails: ["a@ex.com"] }],
      ]),
      orders: [
        {
          customerPhone: "0771111111",
          customerEmail: "a@ex.com",
          totalPrice: 1000,
        },
      ],
    });
    expect(totals.get("phone-c")).toBe(1000);
    expect(totals.get("email-c")).toBe(1000);
  });

  it("does not attribute phone-contact via email", () => {
    const totals = attributeOrderTotalsByContact({
      lookupByContactId: new Map([
        ["phone-c", { phones: ["0771111111"], emails: ["a@ex.com"] }],
      ]),
      orders: [
        {
          customerPhone: "0779999999",
          customerEmail: "a@ex.com",
          totalPrice: 500,
        },
      ],
    });
    expect(totals.get("phone-c")).toBeUndefined();
  });
});

describe("combineLifetimeTotals", () => {
  it("adds order and adapt and defaults missing to 0", () => {
    const combined = combineLifetimeTotals(
      ["a", "b"],
      new Map([["a", 100]]),
      new Map([["a", 25], ["b", 10]])
    );
    expect(combined.get("a")).toBe(125);
    expect(combined.get("b")).toBe(10);
  });
});
