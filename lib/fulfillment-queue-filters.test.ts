import { describe, expect, it } from "vitest";

import {
  deliveryStageOrWhere,
  dispatchStageOrWhere,
  excludeErpOutOfStockBlockedOrdersWhere,
  excludePosOrdersWhere,
  fulfillableOrderPipelineWhere,
  isDeliveryFulfillmentStages,
  isDispatchFulfillmentStages,
  sampleFulfillmentPipelineWhere,
  sampleQueueWhere,
  printFulfillmentPipelineWhere,
} from "@/lib/fulfillment-queue-filters";

describe("isDispatchFulfillmentStages", () => {
  it("matches single dispatch selector stages", () => {
    expect(isDispatchFulfillmentStages(["print", "ready_to_dispatch"])).toBe(true);
  });

  it("does not match delivery invoice stages", () => {
    expect(
      isDispatchFulfillmentStages(["dispatched", "delivery_complete", "invoice_complete"]),
    ).toBe(false);
  });
});

describe("isDeliveryFulfillmentStages", () => {
  it("matches delivery and invoice selector stages", () => {
    expect(
      isDeliveryFulfillmentStages(["dispatched", "delivery_complete", "invoice_complete"]),
    ).toBe(true);
  });

  it("does not match dispatch selector stages", () => {
    expect(isDeliveryFulfillmentStages(["print", "ready_to_dispatch"])).toBe(false);
  });
});

describe("dispatchStageOrWhere", () => {
  it("includes printed orders before dispatch", () => {
    expect(dispatchStageOrWhere.OR?.[0]).toEqual({
      printCount: { gt: 0 },
      fulfillmentStage: {
        in: ["order_received", "sample_free_issue", "print", "ready_to_dispatch"],
      },
    });
  });
});

describe("deliveryStageOrWhere", () => {
  it("includes dispatched orders by stage and dispatchedAt", () => {
    expect(deliveryStageOrWhere.OR).toHaveLength(2);
  });
});

describe("sampleFulfillmentPipelineWhere", () => {
  it("does not filter on Shopify fulfillmentStatus", () => {
    expect(fulfillableOrderPipelineWhere).toMatchObject({
      AND: [
        {
          OR: [
            { fulfillmentStatus: null },
            { fulfillmentStatus: { not: "fulfilled" } },
          ],
        },
      ],
    });
    expect(sampleFulfillmentPipelineWhere).not.toHaveProperty("fulfillmentStatus");
  });
});

describe("printFulfillmentPipelineWhere", () => {
  it("matches vault stage pipeline without Shopify fulfillmentStatus filter", () => {
    expect(printFulfillmentPipelineWhere).toEqual(sampleFulfillmentPipelineWhere);
  });
});

describe("sampleQueueWhere", () => {
  it("requires sample step incomplete and no dispatch milestones", () => {
    expect(sampleQueueWhere).toMatchObject({
      sampleFreeIssueCompleteAt: null,
      dispatchedAt: null,
      deliveryCompleteAt: null,
      invoiceCompleteAt: null,
    });
    expect(sampleQueueWhere).not.toHaveProperty("fulfillmentStatus");
  });
});

describe("excludePosOrdersWhere", () => {
  it("excludes Vault POS and ERP POS source names", () => {
    expect(excludePosOrdersWhere).toEqual({
      sourceName: { notIn: ["pos", "erpnext-pos"] },
    });
  });
});

describe("excludeErpOutOfStockBlockedOrdersWhere", () => {
  it("only blocks when sync error is present and matches OOS patterns", () => {
    expect(excludeErpOutOfStockBlockedOrdersWhere).toEqual({
      NOT: {
        AND: [
          { erpnextSyncError: { not: null } },
          {
            OR: [
              { erpnextSyncError: { contains: "NegativeStockError", mode: "insensitive" } },
              { erpnextSyncError: { contains: "Out of stock -", mode: "insensitive" } },
            ],
          },
        ],
      },
    });
  });
});
