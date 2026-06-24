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
});
