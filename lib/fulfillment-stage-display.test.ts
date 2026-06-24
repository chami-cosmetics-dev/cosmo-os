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

  it("shows sample and print after sample step is complete", () => {
    const badges = getOrderListFulfillmentStageBadges({
      fulfillmentStage: "print",
      sampleFreeIssueCompleteAt: "2026-06-24T10:00:00.000Z",
    });
    expect(badges.map((b) => b.label)).toEqual(["Sample/Free Issue", "Print"]);
  });
});
