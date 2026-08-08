import { describe, expect, it } from "vitest";

import {
  canRequestPaymentMethodChange,
  getPaymentMethodInfo,
} from "@/lib/payment-method-label";

describe("canRequestPaymentMethodChange", () => {
  it("allows COD", () => {
    expect(
      canRequestPaymentMethodChange({ paymentGatewayPrimary: "Cash on Delivery (COD)" }),
    ).toBe(true);
  });

  it("allows Cash (same change flow as COD)", () => {
    expect(getPaymentMethodInfo({ paymentGatewayPrimary: "Cash" }).variant).toBe("cash");
    expect(canRequestPaymentMethodChange({ paymentGatewayPrimary: "Cash" })).toBe(true);
  });

  it("blocks bank transfer and card", () => {
    expect(canRequestPaymentMethodChange({ paymentGatewayPrimary: "bank_transfer" })).toBe(false);
    expect(canRequestPaymentMethodChange({ paymentGatewayPrimary: "cc_checkout" })).toBe(false);
  });

  it("allows pending with no gateway", () => {
    expect(canRequestPaymentMethodChange({ financialStatus: "pending" })).toBe(true);
  });
});
