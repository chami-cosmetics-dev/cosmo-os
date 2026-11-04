import { describe, expect, it } from "vitest";

import {
  createRiderDeliveryToken,
  RIDER_DELIVERY_PAYMENT_CHANGE_PREFIX,
  riderDeliveryTokenAllowsPaymentChange,
} from "@/lib/rider-delivery-token";

describe("rider delivery token", () => {
  it("marks new tokens as payment-change enabled", () => {
    const token = createRiderDeliveryToken();
    expect(token.startsWith(RIDER_DELIVERY_PAYMENT_CHANGE_PREFIX)).toBe(true);
    expect(riderDeliveryTokenAllowsPaymentChange(token)).toBe(true);
  });

  it("keeps old hex tokens on the confirm-only flow", () => {
    expect(riderDeliveryTokenAllowsPaymentChange("a".repeat(32))).toBe(false);
  });
});
