import { describe, expect, it } from "vitest";

import {
  attributeOrderTotalsByContact,
  attributeLastOrderEventByContact,
  combineLifetimeTotals,
  computeLifetimeTotal,
  isOrderIncludedInCustomerLifetimeTotal,
  orderPurchaseAt,
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

  it("matches changed ERP invoices by current ERP customer id once", () => {
    const totals = attributeOrderTotalsByContact({
      lookupByContactId: new Map([
        ["phone-c", { phones: ["0723392776"], emails: [] }],
      ]),
      orders: [
        {
          customerPhone: "0123455555",
          customerEmail: null,
          erpnextCustomerId: "0723392776",
          totalPrice: 6500,
        },
        {
          customerPhone: "0723392776",
          customerEmail: null,
          erpnextCustomerId: "0723392776",
          totalPrice: 1000,
        },
      ],
    });
    expect(totals.get("phone-c")).toBe(7500);
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

describe("attributeLastOrderEventByContact", () => {
  it("keeps latest order location per contact", () => {
    const latest = attributeLastOrderEventByContact({
      lookupByContactId: new Map([
        ["c1", { phones: ["0771111111"], emails: [] }],
      ]),
      orders: [
        {
          customerPhone: "0771111111",
          customerEmail: null,
          companyLocationId: "loc-old",
          at: new Date("2026-01-01T00:00:00Z"),
        },
        {
          customerPhone: "0771111111",
          customerEmail: null,
          companyLocationId: "loc-new",
          at: new Date("2026-06-01T00:00:00Z"),
        },
      ],
    });
    expect(latest.get("c1")?.companyLocationId).toBe("loc-new");
  });

  it("matches last order by current ERP customer id", () => {
    const latest = attributeLastOrderEventByContact({
      lookupByContactId: new Map([
        ["c1", { phones: ["0723392776"], emails: [] }],
      ]),
      orders: [
        {
          customerPhone: "0123455555",
          customerEmail: null,
          erpnextCustomerId: "0723392776",
          companyLocationId: "loc-erp",
          at: new Date("2026-08-21T00:00:00Z"),
        },
      ],
    });
    expect(latest.get("c1")?.companyLocationId).toBe("loc-erp");
  });
});

describe("orderPurchaseAt", () => {
  it("prefers delivery then invoice then created", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const invoiceCompleteAt = new Date("2026-01-02T00:00:00Z");
    const deliveryCompleteAt = new Date("2026-01-03T00:00:00Z");
    expect(
      orderPurchaseAt({ createdAt, invoiceCompleteAt, deliveryCompleteAt })
    ).toEqual(deliveryCompleteAt);
    expect(orderPurchaseAt({ createdAt, invoiceCompleteAt })).toEqual(
      invoiceCompleteAt
    );
    expect(orderPurchaseAt({ createdAt })).toEqual(createdAt);
  });
});
