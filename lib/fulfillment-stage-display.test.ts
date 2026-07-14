import { describe, expect, it } from "vitest";

import { getOrderListFulfillmentStageBadges } from "@/lib/fulfillment-stage-display";

describe("getOrderListFulfillmentStageBadges", () => {
  it("shows pending approval when finance approval is waiting", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "order_received",
      pendingPaymentApproval: true,
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Pending Approval");
  });

  it("shows order received for new shopify orders", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "order_received",
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Order Received");
  });

  it("shows sample stage while samples are being added", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "sample_free_issue",
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Sample/Free Issue");
  });

  it("shows only the current stage after sample is marked complete", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "dispatched",
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Dispatched");
  });

  it("shows only print when order is in print queue", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "print",
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Print");
  });

  it("shows printed when a print-stage order has already been printed", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "print",
      printCount: 1,
      packageReadyAt: null,
      lastPrintedAt: "2026-06-24T10:00:00.000Z",
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Printed");
  });

  it("shows printed after invoice print before package ready", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "ready_to_dispatch",
      printCount: 1,
      packageReadyAt: null,
      lastPrintedAt: "2026-06-24T10:00:00.000Z",
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Printed");
  });

  it("shows printed when legacy print auto-set package ready at same time", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "ready_to_dispatch",
      printCount: 1,
      packageReadyAt: "2026-06-24T10:00:00.000Z",
      lastPrintedAt: "2026-06-24T10:00:00.000Z",
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Printed");
  });

  it("shows ready to dispatch after package ready", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "ready_to_dispatch",
      printCount: 1,
      packageReadyAt: "2026-06-24T11:00:00.000Z",
      lastPrintedAt: "2026-06-24T10:00:00.000Z",
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Ready to Dispatch");
  });

  it("shows dispatched when dispatchedAt is set even if stage lags", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "ready_to_dispatch",
      printCount: 1,
      packageReadyAt: "2026-06-24T10:00:00.000Z",
      lastPrintedAt: "2026-06-24T10:00:00.000Z",
      dispatchedAt: "2026-06-24T16:00:00.000Z",
    });
    expect(badges).toHaveLength(1);
    expect(badges[0]?.label).toBe("Dispatched");
  });
});
