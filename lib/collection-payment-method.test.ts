import { describe, expect, it } from "vitest";

import {
  classifyCollectionPaymentKind,
  collectionGatewayForTarget,
  financeMopKeyToCollectionTarget,
  isRiderLinkPaymentChangeAllowed,
  pendingPaymentMethodChangeZerosCash,
  riderLinkPaymentTargets,
} from "@/lib/collection-payment-method";

describe("rider link payment change", () => {
  it("lets cash orders switch to card or bank", () => {
    expect(classifyCollectionPaymentKind({ paymentGatewayPrimary: "Cash on Delivery (COD)" })).toBe(
      "cash",
    );
    expect(riderLinkPaymentTargets("cash")).toEqual(["card_on_delivery", "bank_transfer"]);
    expect(
      isRiderLinkPaymentChangeAllowed({ current: "cash", target: "bank_transfer" }),
    ).toBe(true);
    expect(
      isRiderLinkPaymentChangeAllowed({ current: "cash", target: "cash" }),
    ).toBe(false);
  });

  it("lets card-on-delivery orders switch to cash or bank", () => {
    expect(
      classifyCollectionPaymentKind({ paymentGatewayPrimary: "Card Payment on Delivery" }),
    ).toBe("card_on_delivery");
    expect(riderLinkPaymentTargets("card_on_delivery")).toEqual(["cash", "bank_transfer"]);
    expect(
      isRiderLinkPaymentChangeAllowed({ current: "card_on_delivery", target: "cash" }),
    ).toBe(true);
  });

  it("treats Cosmo Credit Card as card on delivery", () => {
    expect(classifyCollectionPaymentKind({ paymentGatewayPrimary: "Credit Card" })).toBe(
      "card_on_delivery",
    );
    expect(
      isRiderLinkPaymentChangeAllowed({ current: "card_on_delivery", target: "cash" }),
    ).toBe(true);
  });

  it("does not let prepaid checkout orders change from the rider link", () => {
    expect(classifyCollectionPaymentKind({ paymentGatewayPrimary: "CC Checkout" })).toBeNull();
    expect(classifyCollectionPaymentKind({ paymentGatewayPrimary: "KOKO" })).toBeNull();
    expect(
      isRiderLinkPaymentChangeAllowed({ current: null, target: "cash" }),
    ).toBe(false);
  });

  it("maps collection targets to gateways", () => {
    expect(collectionGatewayForTarget("cash")).toBe("Cash on Delivery (COD)");
    expect(collectionGatewayForTarget("card_on_delivery")).toBe("Card Payment on Delivery");
    expect(collectionGatewayForTarget("bank_transfer")).toBe("bank_transfer");
  });

  it("zeros cash while a bank method-change approval is pending", () => {
    expect(pendingPaymentMethodChangeZerosCash("bank_transfer")).toBe(true);
    expect(pendingPaymentMethodChangeZerosCash("koko")).toBe(true);
    expect(pendingPaymentMethodChangeZerosCash(null)).toBe(false);
  });

  it("maps finance MOP keys to collection targets", () => {
    expect(financeMopKeyToCollectionTarget("cash")).toBe("cash");
    expect(financeMopKeyToCollectionTarget("cod")).toBe("cash");
    expect(financeMopKeyToCollectionTarget("card_delivery")).toBe("card_on_delivery");
    expect(financeMopKeyToCollectionTarget("koko")).toBeNull();
  });
});
