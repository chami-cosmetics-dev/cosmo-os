import { describe, expect, it } from "vitest";

import {
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
