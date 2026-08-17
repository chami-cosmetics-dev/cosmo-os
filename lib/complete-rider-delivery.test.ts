import { describe, expect, it } from "vitest";

import { isRiderDeliveryAlreadyCompletedStage } from "@/lib/complete-rider-delivery";

describe("isRiderDeliveryAlreadyCompletedStage", () => {
  it("treats delivery_complete and invoice_complete as already delivered", () => {
    expect(isRiderDeliveryAlreadyCompletedStage("delivery_complete")).toBe(true);
    expect(isRiderDeliveryAlreadyCompletedStage("invoice_complete")).toBe(true);
  });

  it("does not treat dispatched as complete", () => {
    expect(isRiderDeliveryAlreadyCompletedStage("dispatched")).toBe(false);
    expect(isRiderDeliveryAlreadyCompletedStage("print")).toBe(false);
  });
});
