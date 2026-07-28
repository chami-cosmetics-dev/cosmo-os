import { describe, expect, it } from "vitest";

import {
  normalizeDashboardSalesDateType,
} from "@/lib/page-data/dashboard-overview-shared";
import {
  buildDashboardSalesDateFilter,
  getPlacedDashboardSalesBucket,
  isDashboardSalesOrderEligible,
} from "@/lib/page-data/dashboard-sales";
import { dashboardSalesDateTypeSchema } from "@/lib/validation";

describe("normalizeDashboardSalesDateType / zod aliases", () => {
  it("maps legacy aliases to new date types", () => {
    expect(normalizeDashboardSalesDateType("order")).toBe("placed_all");
    expect(normalizeDashboardSalesDateType("completed")).toBe("closed_in_period");
    expect(normalizeDashboardSalesDateType("delivery_completed")).toBe("delivered_all");
    expect(normalizeDashboardSalesDateType("pending_invoice_complete")).toBe(
      "delivered_pending_invoice",
    );
    expect(normalizeDashboardSalesDateType("placed_open")).toBe("placed_open");
  });

  it("zod schema accepts legacy and canonical values", () => {
    expect(dashboardSalesDateTypeSchema.parse("order")).toBe("placed_all");
    expect(dashboardSalesDateTypeSchema.parse("completed")).toBe("closed_in_period");
    expect(dashboardSalesDateTypeSchema.parse("placed_all")).toBe("placed_all");
    expect(dashboardSalesDateTypeSchema.parse("delivered_pending_invoice")).toBe(
      "delivered_pending_invoice",
    );
  });
});

describe("getPlacedDashboardSalesBucket", () => {
  const deliveredAt = new Date("2026-07-01T10:00:00.000Z");
  const closedAt = new Date("2026-07-02T10:00:00.000Z");

  it("partitions placed orders mutually exclusively", () => {
    expect(
      getPlacedDashboardSalesBucket({
        sourceName: "web",
        financialStatus: "pending",
        fulfillmentStatus: null,
        invoiceCompleteAt: closedAt,
        deliveryCompleteAt: deliveredAt,
        fulfillmentStage: "invoice_complete",
      }),
    ).toBe("placed_invoice_completed");

    expect(
      getPlacedDashboardSalesBucket({
        sourceName: "web",
        financialStatus: "pending",
        fulfillmentStatus: null,
        invoiceCompleteAt: null,
        deliveryCompleteAt: deliveredAt,
        fulfillmentStage: "delivery_complete",
      }),
    ).toBe("placed_pending_invoice");

    expect(
      getPlacedDashboardSalesBucket({
        sourceName: "web",
        financialStatus: "pending",
        fulfillmentStatus: null,
        invoiceCompleteAt: null,
        deliveryCompleteAt: null,
        fulfillmentStage: "dispatched",
      }),
    ).toBe("placed_open");
  });

  it("keeps open POS without invoice close out of pending bucket", () => {
    expect(
      getPlacedDashboardSalesBucket({
        sourceName: "erpnext-pos",
        financialStatus: "paid",
        fulfillmentStatus: "fulfilled",
        invoiceCompleteAt: null,
        deliveryCompleteAt: deliveredAt,
        fulfillmentStage: "delivery_complete",
      }),
    ).toBe("placed_open");
  });
});

describe("isDashboardSalesOrderEligible", () => {
  const deliveredAt = new Date("2026-07-01T10:00:00.000Z");
  const closedAt = new Date("2026-07-02T10:00:00.000Z");

  it("counts paid and pending for placed_all", () => {
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "paid", fulfillmentStatus: null },
        "placed_all",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "pending", fulfillmentStatus: null },
        "placed_all",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        { sourceName: "web", financialStatus: "voided", fulfillmentStatus: null },
        "placed_all",
      ),
    ).toBe(false);
  });

  it("includes POS on placed_all when paid or pending", () => {
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
        },
        "placed_all",
      ),
    ).toBe(true);
  });

  it("tallies placed buckets without overlap", () => {
    const openOrder = {
      sourceName: "web",
      financialStatus: "pending" as const,
      fulfillmentStatus: null,
      fulfillmentStage: "dispatched",
      deliveryCompleteAt: null,
      invoiceCompleteAt: null,
    };
    const pendingOrder = {
      sourceName: "web",
      financialStatus: "pending" as const,
      fulfillmentStatus: null,
      fulfillmentStage: "delivery_complete",
      deliveryCompleteAt: deliveredAt,
      invoiceCompleteAt: null,
    };
    const closedOrder = {
      sourceName: "web",
      financialStatus: "paid" as const,
      fulfillmentStatus: "fulfilled",
      fulfillmentStage: "invoice_complete",
      deliveryCompleteAt: deliveredAt,
      invoiceCompleteAt: closedAt,
    };

    expect(isDashboardSalesOrderEligible(openOrder, "placed_open")).toBe(true);
    expect(isDashboardSalesOrderEligible(openOrder, "placed_pending_invoice")).toBe(false);
    expect(isDashboardSalesOrderEligible(openOrder, "placed_invoice_completed")).toBe(false);

    expect(isDashboardSalesOrderEligible(pendingOrder, "placed_open")).toBe(false);
    expect(isDashboardSalesOrderEligible(pendingOrder, "placed_pending_invoice")).toBe(true);
    expect(isDashboardSalesOrderEligible(pendingOrder, "placed_invoice_completed")).toBe(false);

    expect(isDashboardSalesOrderEligible(closedOrder, "placed_open")).toBe(false);
    expect(isDashboardSalesOrderEligible(closedOrder, "placed_pending_invoice")).toBe(false);
    expect(isDashboardSalesOrderEligible(closedOrder, "placed_invoice_completed")).toBe(true);
  });

  it("excludes POS from delivered_* and placed_pending_invoice", () => {
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          fulfillmentStage: "delivery_complete",
          deliveryCompleteAt: deliveredAt,
        },
        "delivered_all",
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
        "delivered_all",
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
        "delivered_all",
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
        "delivered_pending_invoice",
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
        "placed_pending_invoice",
      ),
    ).toBe(false);
  });

  it("includes non-voided POS in closed_in_period and placed_invoice_completed", () => {
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "erpnext-pos",
          financialStatus: "paid",
          fulfillmentStatus: "fulfilled",
          invoiceCompleteAt: closedAt,
        },
        "closed_in_period",
      ),
    ).toBe(true);
    expect(
      isDashboardSalesOrderEligible(
        {
          sourceName: "pos",
          financialStatus: "paid",
          fulfillmentStatus: null,
          invoiceCompleteAt: closedAt,
        },
        "placed_invoice_completed",
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
        "closed_in_period",
      ),
    ).toBe(false);
  });
});

describe("buildDashboardSalesDateFilter", () => {
  const fromDate = new Date("2026-07-01T00:00:00.000+05:30");
  const toDate = new Date("2026-07-28T23:59:59.999+05:30");

  it("filters placed_all by createdAt", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "placed_all",
      }),
    ).toEqual({
      createdAt: { gte: fromDate, lte: toDate },
    });
  });

  it("filters delivered_pending_invoice by delivery date and open invoice", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "delivered_pending_invoice",
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

  it("excludes POS from delivered_all date filter", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "delivered_all",
      }),
    ).toEqual({
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

  it("filters closed_in_period by invoiceCompleteAt", () => {
    expect(
      buildDashboardSalesDateFilter({
        fromDate,
        toDate,
        dateType: "closed_in_period",
      }),
    ).toEqual({
      invoiceCompleteAt: {
        not: null,
        gte: fromDate,
        lte: toDate,
      },
    });
  });
});
