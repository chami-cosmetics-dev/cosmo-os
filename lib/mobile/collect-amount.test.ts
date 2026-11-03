import { describe, expect, it } from "vitest";

import {
  assertPaymentMethodsAllowed,
  resolveMobileCollectAmount,
} from "@/lib/mobile/collect-amount";

describe("resolveMobileCollectAmount", () => {
  it("shows cash leg only for partial prepaid + cash", () => {
    const result = resolveMobileCollectAmount({
      totalPrice: 8000,
      collectCashAmount: 3000,
      paymentGatewayPrimary: "koko",
      financialStatus: "partially_paid",
    });
    expect(result).toMatchObject({
      amount: 3000,
      expectedPaymentMethod: "cod",
      collectionKind: "partial",
    });
    expect(result.allowedPaymentMethods).toContain("cod");
    expect(result.allowedPaymentMethods).toContain("card");
  });

  it("shows 0 for fully prepaid KOKO / Mintpay / bank", () => {
    for (const gateway of ["KOKO", "mintpay", "bank_transfer", "cc_checkout"]) {
      const result = resolveMobileCollectAmount({
        totalPrice: 5000,
        paymentGatewayPrimary: gateway,
        financialStatus: "paid",
      });
      expect(result.amount).toBe(0);
      expect(result.expectedPaymentMethod).toBe("already_paid");
      expect(result.collectionKind).toBe("prepaid");
      expect(result.allowedPaymentMethods).toEqual(["already_paid"]);
    }
  });

  it("blocks card on coupon COD", () => {
    const result = resolveMobileCollectAmount({
      totalPrice: 4500,
      paymentGatewayPrimary: "Cash on Delivery (COD)",
      financialStatus: "pending",
      discountCodes: [{ code: "SV20", amount: "200.00" }],
    });
    expect(result.collectionKind).toBe("full");
    expect(result.amount).toBe(4500);
    expect(result.discountCouponCode).toBe("SV20");
    expect(result.allowedPaymentMethods).toEqual(["cod", "bank_transfer"]);
    expect(
      assertPaymentMethodsAllowed([{ paymentMethod: "card" }], result.allowedPaymentMethods),
    ).toMatch(/Card is not allowed/);
  });

  it("allows card on normal COD without coupon", () => {
    const result = resolveMobileCollectAmount({
      totalPrice: 2000,
      paymentGatewayPrimary: "cod",
      financialStatus: "pending",
    });
    expect(result.allowedPaymentMethods).toContain("card");
  });
});
