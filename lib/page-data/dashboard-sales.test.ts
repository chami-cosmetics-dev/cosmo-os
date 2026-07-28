import { describe, expect, it } from "vitest";

import {
  buildDashboardSalesDateFilter,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";

describe("isDashboardSalesOrderEligible", () => {
  it("counts paid and pending for order-date sales", () => {
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "paid", fulfillmentStatus: null },
        "order",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "pending", fulfillmentStatus: null },
        "order",
      ),
    ).toBe(true);
  });

  it("excludes voided orders from order-date sales (rejected finance orders)", () => {
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "voided", fulfillmentStatus: null },
        "order",
      ),
    ).toBe(false);
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "VOIDED", fulfillmentStatus: null },
        "order",
      ),
    ).toBe(false);
  });

  it("includes POS on invoice date when paid or pending", () => {
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
        },
        "order",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "pos",
          financialStatus: "pending",
          fulfillmentStatus: null,
        },
        "order",
      ),
    ).toBe(true);
  });

  it("excludes POS from delivery completed and pending invoice complete", () => {
    const deliveredAt = new Date("2026-07-01T10:00:00.000Z");
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          deliveryCompleteAt: deliveredAt,
        },
        "delivery_completed",
      ),
    ).toBe(false);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "web",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          deliveryCompleteAt: deliveredAt,
        },
        "delivery_completed",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: deliveredAt,
          invoiceCompleteAt: null,
        },
        "pending_invoice_complete",
      ),
    ).toBe(false);
  });

  it("includes non-voided POS in invoice-completed sales", () => {
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          invoiceCompleteAt: new Date("2026-07-01T10:00:00.000Z"),
        },
        "completed",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "pos",
          financialStatus: "paid",
          fulfillmentStatus: null,
          invoiceCompleteAt: new Date("2026-07-01T10:00:00.000Z"),
        },
        "completed",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "voided",
          fulfillmentStatus: "fulfilled",
          invoiceCompleteAt: new Date("2026-07-01T10:00:00.000Z"),
        },
        "completed",
      ),
    ).toBe(false);
  });

  it("counts pending invoice complete only for delivered non-POS queue orders", () => {
    const deliveredAt = new Date("2026-07-01T10:00:00.000Z");
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "web",
          financialStatus: "pending",
          fulfillmentStatus: "partial",
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: deliveredAt,
          invoiceCompleteAt: null,
        },
        "pending_invoice_complete",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "web",
          financialStatus: "pending",
          fulfillmentStatus: "partial",
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: deliveredAt,
          invoiceCompleteAt: new Date("2026-07-02T10:00:00.000Z"),
        },
        "pending_invoice_complete",
      ),
    ).toBe(false);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: deliveredAt,
          invoiceCompleteAt: null,
        },
        "pending_invoice_complete",
      ),
    ).toBe(false);
  });
});

describe("buildDashboardSalesDateFilter", () => {
  const fromDate = new Date("2026-07-01T00:00:00.000+05:30");
  const toDate = new Date("2026-07-28T23:59:59.999+05:30");

  it("filters pending invoice complete by delivery date and open invoice", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "pending_invoice_complete",
      }),
    ).toEqual({
      deliveryCompleteAt: {
        not: null,
        gte: fromDate,
        lte: toDate,
      },
      invoiceCompleteAt: null,
      fulfillmentStage: "delivery_complete",
      financialStatus: { not: "voided" },
      sourceName: { notIn: ["pos", "erpnext-pos"] },
    });
  });

  it("excludes POS from delivery completed date filter", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "delivery_completed",
      }),
    ).toEqual({
      deliveryCompleteAt: {
        not: null,
        gte: fromDate,
        lte: toDate,
      },
      sourceName: { notIn: ["pos", "erpnext-pos"] },
    });
  });
});
