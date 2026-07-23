import { describe, expect, it } from "vitest";

import {
  isCcCheckoutGateway,
  isEarlyFinancialInvoiceCompleteGateway,
  isPrePaidGateway,
  normalizePaymentGatewayKey,
  orderHasCcCheckoutGateway,
  orderHasEarlyFinancialInvoiceCompleteGateway,
  shouldSkipDeliveryPaymentApproval,
} from "@/lib/delivery-payment-approval";

describe("normalizePaymentGatewayKey", () => {
  it("normalizes separators and case", () => {
    expect(normalizePaymentGatewayKey("CC_CHECKOUT")).toBe("cc checkout");
    expect(normalizePaymentGatewayKey("cc-checkout")).toBe("cc checkout");
    expect(normalizePaymentGatewayKey("  Cc Checkout  ")).toBe("cc checkout");
  });
});

describe("isCcCheckoutGateway", () => {
  it("matches cc checkout variants", () => {
    expect(isCcCheckoutGateway("CC CHECKOUT")).toBe(true);
    expect(isCcCheckoutGateway("cc_checkout")).toBe(true);
    expect(isCcCheckoutGateway("cc-checkout")).toBe(true);
    expect(isCcCheckoutGateway("cc")).toBe(true);
    expect(isCcCheckoutGateway("cod")).toBe(false);
    expect(isCcCheckoutGateway("webxpay")).toBe(false);
  });
});

describe("orderHasCcCheckoutGateway", () => {
  it("detects primary or names", () => {
    expect(
      orderHasCcCheckoutGateway({
        paymentGatewayPrimary: "cc_checkout",
        paymentGatewayNames: [],
      }),
    ).toBe(true);
    expect(
      orderHasCcCheckoutGateway({
        paymentGatewayPrimary: null,
        paymentGatewayNames: ["CC-CHECKOUT"],
      }),
    ).toBe(true);
  });
});

describe("isEarlyFinancialInvoiceCompleteGateway", () => {
  it("matches CC Checkout and WebXPay only", () => {
    expect(isEarlyFinancialInvoiceCompleteGateway("CC CHECKOUT")).toBe(true);
    expect(isEarlyFinancialInvoiceCompleteGateway("WebXPay")).toBe(true);
    expect(isEarlyFinancialInvoiceCompleteGateway("KOKO")).toBe(false);
    expect(isEarlyFinancialInvoiceCompleteGateway("bank_transfer")).toBe(false);
    expect(isEarlyFinancialInvoiceCompleteGateway("cod")).toBe(false);
  });
});

describe("orderHasEarlyFinancialInvoiceCompleteGateway", () => {
  it("detects WebXPay on names", () => {
    expect(
      orderHasEarlyFinancialInvoiceCompleteGateway({
        paymentGatewayPrimary: null,
        paymentGatewayNames: ["webxpay"],
      }),
    ).toBe(true);
  });
});

describe("isPrePaidGateway", () => {
  it("detects koko, bank, and cc checkout", () => {
    expect(isPrePaidGateway("KOKO")).toBe(true);
    expect(isPrePaidGateway("bank_transfer")).toBe(true);
    expect(isPrePaidGateway("cc_checkout")).toBe(true);
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

  it("skips CC Checkout", () => {
    expect(
      shouldSkipDeliveryPaymentApproval({
        paymentGatewayPrimary: "CC CHECKOUT",
        paymentGatewayNames: [],
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
    expect(
      shouldSkipDeliveryPaymentApproval({
        paymentGatewayPrimary: "cod",
        paymentGatewayNames: ["cod", "bank_transfer"],
      }),
    ).toBe(false);
  });
});
