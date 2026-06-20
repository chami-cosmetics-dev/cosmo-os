import { describe, expect, it } from "vitest";

import {
  formatDeliveredTimelineWho,
  formatInvoiceCompleteTimelineWho,
} from "@/lib/order-dispatch";

describe("fulfillment timeline labels", () => {
  it("does not show courier on Delivered until delivery is marked", () => {
    expect(
      formatDeliveredTimelineWho({
        deliveryCompleteAt: null,
        deliveryCompleteBy: null,
        dispatchLabel: "City Pack",
      }),
    ).toBe("-");
  });

  it("shows courier and store user after mark delivered", () => {
    expect(
      formatDeliveredTimelineWho({
        deliveryCompleteAt: "2026-06-18T12:00:00.000Z",
        deliveryCompleteBy: { name: "Irush Ratnayake", email: null },
        dispatchLabel: "City Pack",
      }),
    ).toBe("City Pack · marked by Irush Ratnayake");
  });

  it("shows finance approver on invoice complete", () => {
    expect(
      formatInvoiceCompleteTimelineWho({
        invoiceCompleteBy: { name: "Finance User", email: null },
        deliveryPaymentApproval: null,
      }),
    ).toBe("Finance User");
  });
});
