import { describe, expect, it } from "vitest";

import {
  canRequestPaymentMethodChange,
  getPaymentMethodInfo,
  isCardOnDeliveryGateway,
  isUnpaidCardOnDeliveryFinance,
  orderPaymentFinanceApproveMarksPaid,
  parsePaymentMethodChangeTarget,
} from "@/lib/payment-method-label";

describe("canRequestPaymentMethodChange", () => {
  it("allows COD (labeled Cash after main rename)", () => {
    expect(
      getPaymentMethodInfo({ paymentGatewayPrimary: "Cash on Delivery (COD)" }),
    ).toEqual({ label: "Cash", variant: "cash" });
    expect(
      canRequestPaymentMethodChange({ paymentGatewayPrimary: "Cash on Delivery (COD)" }),
    ).toBe(true);
  });

  it("allows Cash (same change flow as COD)", () => {
    expect(getPaymentMethodInfo({ paymentGatewayPrimary: "Cash" }).variant).toBe("cash");
    expect(canRequestPaymentMethodChange({ paymentGatewayPrimary: "Cash" })).toBe(true);
  });

  it("blocks bank transfer, card, and Mintpay", () => {
    expect(canRequestPaymentMethodChange({ paymentGatewayPrimary: "bank_transfer" })).toBe(false);
    expect(canRequestPaymentMethodChange({ paymentGatewayPrimary: "cc_checkout" })).toBe(false);
    expect(canRequestPaymentMethodChange({ paymentGatewayPrimary: "mintpay" })).toBe(false);
  });

  it("labels Mintpay as paid", () => {
    expect(getPaymentMethodInfo({ paymentGatewayPrimary: "Mintpay" })).toEqual({
      label: "Mintpay",
      variant: "paid",
    });
  });

  it("allows pending with no gateway", () => {
    expect(canRequestPaymentMethodChange({ financialStatus: "pending" })).toBe(true);
  });
});

describe("parsePaymentMethodChangeTarget", () => {
  it("reads finance request notes", () => {
    expect(parsePaymentMethodChangeTarget("Bank Transfer — payment method change request — amount: 1000")).toBe(
      "bank_transfer",
    );
    expect(parsePaymentMethodChangeTarget("KOKO — payment method change request — amount: 1000")).toBe("koko");
    expect(parsePaymentMethodChangeTarget("Mintpay — payment method change request — amount: 1000")).toBe("mintpay");
  });

  it("returns null for unrelated notes", () => {
    expect(parsePaymentMethodChangeTarget(null)).toBeNull();
    expect(parsePaymentMethodChangeTarget("COD collection")).toBeNull();
  });
});

describe("orderPaymentFinanceApproveMarksPaid", () => {
  it("never marks card on delivery paid", () => {
    expect(
      orderPaymentFinanceApproveMarksPaid({
        paymentGatewayPrimary: "Card on Delivery",
        paymentGatewayNames: [],
      }),
    ).toBe(false);
    expect(
      orderPaymentFinanceApproveMarksPaid(
        { paymentGatewayPrimary: null, paymentGatewayNames: [] },
        { requestNote: "Card on Delivery — amount: 2500" },
      ),
    ).toBe(false);
  });

  it("still marks koko paid", () => {
    expect(
      orderPaymentFinanceApproveMarksPaid({
        paymentGatewayPrimary: "KOKO",
        paymentGatewayNames: [],
      }),
    ).toBe(true);
  });
});

describe("isUnpaidCardOnDeliveryFinance", () => {
  it("is Vault-only", () => {
    expect(
      isUnpaidCardOnDeliveryFinance(
        { paymentGatewayPrimary: "Card on Delivery", paymentGatewayNames: [] },
        { vaultOs: false },
      ),
    ).toBe(false);
    expect(
      isUnpaidCardOnDeliveryFinance(
        { paymentGatewayPrimary: "Card on Delivery", paymentGatewayNames: [] },
        { vaultOs: true },
      ),
    ).toBe(true);
    expect(
      isUnpaidCardOnDeliveryFinance(
        { paymentGatewayPrimary: "KOKO", paymentGatewayNames: [] },
        { vaultOs: true },
      ),
    ).toBe(false);
  });
});

describe("isCardOnDeliveryGateway", () => {
  it("matches card on delivery variants", () => {
    expect(isCardOnDeliveryGateway("Card on Delivery")).toBe(true);
    expect(isCardOnDeliveryGateway("card_on_delivery")).toBe(true);
    expect(isCardOnDeliveryGateway("Card Payment on Delivery")).toBe(true);
    expect(isCardOnDeliveryGateway("card delivery")).toBe(true);
    expect(isCardOnDeliveryGateway("cod")).toBe(false);
    expect(isCardOnDeliveryGateway("cc checkout")).toBe(false);
  });
});
