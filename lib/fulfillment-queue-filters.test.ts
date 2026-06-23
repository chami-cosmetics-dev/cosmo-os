import { describe, expect, it } from "vitest";

import {
  deliveryStageOrWhere,
  dispatchStageOrWhere,
  isDeliveryFulfillmentStages,
  isDispatchFulfillmentStages,
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
