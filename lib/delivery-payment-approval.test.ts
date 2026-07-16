import { describe, expect, it } from "vitest";

import {
  isPrePaidGateway,
  shouldSkipDeliveryPaymentApproval,
} from "@/lib/delivery-payment-approval";

describe("isPrePaidGateway", () => {
  it("detects koko and bank", () => {
    expect(isPrePaidGateway("KOKO")).toBe(true);
    expect(isPrePaidGateway("bank_transfer")).toBe(true);
    expect(isPrePaidGateway("cod")).toBe(false);
  });
});

describe("shouldSkipDeliveryPaymentApproval", () => {
  it("skips when primary is KOKO", () => {
    expect(
      shouldSkipDeliveryPaymentApproval({
        paymentGatewayPrimary: "KOKO",
        paymentGatewayNames: ["cod", "KOKO"],
      }),
    ).toBe(true);
  });

  it("skips when primary empty but names include bank", () => {
    expect(
      shouldSkipDeliveryPaymentApproval({
        paymentGatewayPrimary: null,
        paymentGatewayNames: ["bank_transfer"],
      }),
    ).toBe(true);
  });

  it("does not skip COD when primary is COD even if names list bank", () => {
    // Names include all checkout options — primary is the one used.
    expect(
      shouldSkipDeliveryPaymentApproval({
        paymentGatewayPrimary: "cod",
        paymentGatewayNames: ["cod", "bank_transfer"],
      }),
    ).toBe(false);
  });
});
