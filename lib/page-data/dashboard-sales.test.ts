import { describe, expect, it } from "vitest";

import {
  normalizeDashboardSalesDateType,
} from "@/lib/page-data/dashboard-overview-shared";
import {
  buildDashboardSalesDateFilter,
  getPlacedStatusPartition,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import { dashboardSalesDateTypeSchema } from "@/lib/validation";

describe("normalizeDashboardSalesDateType / zod aliases", () => {
  it("maps legacy aliases to canonical date types", () => {
    expect(normalizeDashboardSalesDateType("order")).toBe("all_orders");
    expect(normalizeDashboardSalesDateType("placed_all")).toBe("all_orders");
    expect(normalizeDashboardSalesDateType("placed_open")).toBe("not_delivered");
    expect(normalizeDashboardSalesDateType("completed")).toBe("bill_done_old");
    expect(normalizeDashboardSalesDateType("closed_in_period")).toBe("bill_done_old");
    expect(normalizeDashboardSalesDateType("delivery_completed")).toBe("delivered_in_dates");
    expect(normalizeDashboardSalesDateType("delivered_all")).toBe("delivered_in_dates");
    expect(normalizeDashboardSalesDateType("pending_invoice_complete")).toBe("still_bill_open");
  });

  it("zod schema accepts legacy and canonical values", () => {
    expect(dashboardSalesDateTypeSchema.parse("order")).toBe("all_orders");
    expect(dashboardSalesDateTypeSchema.parse("completed")).toBe("bill_done_old");
    expect(dashboardSalesDateTypeSchema.parse("placed_all")).toBe("all_orders");
    expect(dashboardSalesDateTypeSchema.parse("all_orders")).toBe("all_orders");
    expect(dashboardSalesDateTypeSchema.parse("bill_done_early")).toBe("bill_done_early");
    expect(dashboardSalesDateTypeSchema.parse("delivered_pending_invoice")).toBe(
      "still_bill_open",
    );
  });
});

describe("getPlacedStatusPartition", () => {
  const deliveredAt = new Date("2026-07-01T10:00:00.000Z");
  const closedAt = new Date("2026-07-02T10:00:00.000Z");

  it("partitions placed orders mutually exclusively", () => {
    expect(
      getPlacedStatusPartition({
        sourceName: "web",
        financialStatus: "pending",
        fulfillmentStatus: null,
        invoiceCompleteAt: closedAt,
        deliveryCompleteAt: deliveredAt,
        fulfillmentStage: "invoice_complete",
      }),
    ).toBe("done_after_delivery");

    expect(
      getPlacedStatusPartition({
        sourceName: "web",
        financialStatus: "pending",
        fulfillmentStatus: null,
        invoiceCompleteAt: null,
        deliveryCompleteAt: deliveredAt,
        fulfillmentStage: "delivery_complete",
      }),
    ).toBe("bill_open");

    expect(
      getPlacedStatusPartition({
        sourceName: "web",
        financialStatus: "pending",
        fulfillmentStatus: null,
        invoiceCompleteAt: null,
        deliveryCompleteAt: null,
        fulfillmentStage: "dispatched",
      }),
    ).toBe("not_delivered");

    expect(
      getPlacedStatusPartition({
        sourceName: "web",
        financialStatus: "paid",
        fulfillmentStatus: null,
        invoiceCompleteAt: closedAt,
        deliveryCompleteAt: null,
        fulfillmentStage: "dispatched",
      }),
    ).toBe("bill_done_early");
  });

  it("keeps POS without invoice close in bill_open when delivery timestamp set", () => {
    expect(
      getPlacedStatusPartition({
        sourceName: "erpnext-pos",
        financialStatus: "paid",
        fulfillmentStatus: "fulfilled",
        invoiceCompleteAt: null,
        deliveryCompleteAt: deliveredAt,
        fulfillmentStage: "delivery_complete",
      }),
    ).toBe("bill_open");
  });
});

describe("isDashboardSalesOrderEligible", () => {
  const deliveredAt = new Date("2026-07-01T10:00:00.000Z");
  const closedAt = new Date("2026-07-02T10:00:00.000Z");

  it("counts paid, pending, and partially_paid for all_orders", () => {
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "paid", fulfillmentStatus: null },
        "all_orders",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "pending", fulfillmentStatus: null },
        "all_orders",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "partially_paid", fulfillmentStatus: null },
        "all_orders",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "voided", fulfillmentStatus: null },
        "all_orders",
      ),
    ).toBe(false);
  });

  it("includes POS on all_orders when paid or pending", () => {
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
        },
        "all_orders",
      ),
    ).toBe(true);
  });

  it("tallies status partitions without overlap and summing to all_orders", () => {
    const orders = [
      {
        sourceName: "web",
        financialStatus: "pending" as const,
        fulfillmentStatus: null,
        fulfillmentStage: "dispatched",
        deliveryCompleteAt: null,
        invoiceCompleteAt: null,
        total: 100,
      },
      {
        sourceName: "web",
        financialStatus: "paid" as const,
        fulfillmentStatus: null,
        fulfillmentStage: "dispatched",
        deliveryCompleteAt: null,
        invoiceCompleteAt: closedAt,
        total: 50,
      },
      {
        sourceName: "web",
        financialStatus: "pending" as const,
        fulfillmentStatus: null,
        fulfillmentStage: "delivery_complete",
        deliveryCompleteAt: deliveredAt,
        invoiceCompleteAt: null,
        total: 200,
      },
      {
        sourceName: "web",
        financialStatus: "paid" as const,
        fulfillmentStatus: "fulfilled",
        fulfillmentStage: "invoice_complete",
        deliveryCompleteAt: deliveredAt,
        invoiceCompleteAt: closedAt,
        total: 300,
      },
    ];

    const partitions = {
      not_delivered: 0,
      bill_done_early: 0,
      bill_open: 0,
      done_after_delivery: 0,
    };
    let allOrders = 0;

    for (const order of orders) {
      expect(isDashboardSalesOrderEligible(order, "all_orders")).toBe(true);
      allOrders += order.total;
      const key = getPlacedStatusPartition(order);
      partitions[key] += order.total;
      for (const partition of Object.keys(partitions) as Array<keyof typeof partitions>) {
        expect(isDashboardSalesOrderEligible(order, partition)).toBe(partition === key);
      }
    }

    expect(
      partitions.not_delivered +
        partitions.bill_done_early +
        partitions.bill_open +
        partitions.done_after_delivery,
    ).toBe(allOrders);
    expect(partitions).toEqual({
      not_delivered: 100,
      bill_done_early: 50,
      bill_open: 200,
      done_after_delivery: 300,
    });
  });

  it("excludes bill_done_early from delivered filters and excludes POS", () => {
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "web",
          financialStatus: "paid",
          fulfillmentStatus: null,
          fulfillmentStage: "dispatched",
          deliveryCompleteAt: null,
          invoiceCompleteAt: closedAt,
        },
        "delivered_in_dates",
      ),
    ).toBe(false);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: deliveredAt,
        },
        "delivered_in_dates",
      ),
    ).toBe(false);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "web",
          financialStatus: "pending",
          fulfillmentStatus: null,
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: deliveredAt,
        },
        "delivered_in_dates",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "web",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          fulfillmentStage: "invoice_complete",
          deliveryCompleteAt: deliveredAt,
          invoiceCompleteAt: closedAt,
        },
        "delivered_in_dates",
      ),
    ).toBe(false);
  });

  it("includes non-voided POS in bill_done_old and done_after_delivery", () => {
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          invoiceCompleteAt: closedAt,
        },
        "bill_done_old",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "pos",
          financialStatus: "paid",
          fulfillmentStatus: null,
          invoiceCompleteAt: closedAt,
          deliveryCompleteAt: deliveredAt,
        },
        "done_after_delivery",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "voided",
          fulfillmentStatus: "fulfilled",
          invoiceCompleteAt: closedAt,
        },
        "bill_done_old",
      ),
    ).toBe(false);
  });

  it("backlog filters ignore place-date fields in eligibility", () => {
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "web",
          financialStatus: "pending",
          fulfillmentStatus: null,
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: deliveredAt,
          invoiceCompleteAt: null,
        },
        "still_bill_open",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "web",
          financialStatus: "pending",
          fulfillmentStatus: null,
          fulfillmentStage: "dispatched",
          deliveryCompleteAt: null,
          invoiceCompleteAt: closedAt,
        },
        "still_not_delivered",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "pos",
          financialStatus: "pending",
          fulfillmentStatus: null,
          fulfillmentStage: "dispatched",
          deliveryCompleteAt: null,
        },
        "still_not_delivered",
      ),
    ).toBe(false);
  });
});

describe("buildDashboardSalesDateFilter", () => {
  const fromDate = new Date("2026-07-01T00:00:00.000+05:30");
  const toDate = new Date("2026-07-28T23:59:59.999+05:30");

  it("filters all_orders by createdAt", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "all_orders",
      }),
    ).toEqual({
      createdAt: { gte: fromDate, lte: toDate },
    });
  });

  it("filters delivered_in_dates by place ∩ delivery with stage and non-POS", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "delivered_in_dates",
      }),
    ).toEqual({
      createdAt: { gte: fromDate, lte: toDate },
      deliveryCompleteAt: {
        not: null,
        gte: fromDate,
        lte: toDate,
      },
      fulfillmentStage: "delivery_complete",
      financialStatus: { not: "voided" },
      sourceName: { notIn: ["pos", "erpnext-pos"] },
    });
  });

  it("filters bill_done_old by invoice in range and place before range", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "bill_done_old",
      }),
    ).toEqual({
      invoiceCompleteAt: {
        not: null,
        gte: fromDate,
        lte: toDate,
      },
      createdAt: { lt: fromDate },
    });
  });

  it("filters still_bill_open without place-date range", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "still_bill_open",
      }),
    ).toEqual({
      invoiceCompleteAt: null,
      financialStatus: { not: "voided" },
      sourceName: { notIn: ["pos", "erpnext-pos"] },
      OR: [
        { deliveryCompleteAt: { not: null } },
        { fulfillmentStage: "delivery_complete" },
      ],
    });
  });

  it("filters bill_done_early by invoice without delivery timestamp", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "bill_done_early",
      }),
    ).toEqual({
      createdAt: { gte: fromDate, lte: toDate },
      invoiceCompleteAt: { not: null },
      deliveryCompleteAt: null,
    });
  });
});
