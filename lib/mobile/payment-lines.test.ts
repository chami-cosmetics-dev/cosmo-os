import { describe, expect, it } from "vitest";

import {
  cashAmountFromDeliveryPayment,
  derivePaymentHeaderFromLines,
  normalizePaymentLines,
  sumPaymentLineAmounts,
} from "@/lib/mobile/payment-lines";

describe("normalizePaymentLines", () => {
  it("keeps legacy single-method payload as one line", () => {
    const lines = normalizePaymentLines({
      paymentMethod: "cod",
      collectedAmount: 1500,
      referenceNote: "ok",
    });
    expect(lines).toEqual([
      {
        paymentMethod: "cod",
        amount: 1500,
        bankReference: null,
        cardReference: null,
        referenceNote: "ok",
      },
    ]);
  });

  it("uses explicit lines when provided", () => {
    const lines = normalizePaymentLines({
      lines: [
        { paymentMethod: "cod", amount: 2000 },
        { paymentMethod: "card", amount: 3000, cardReference: "POS-1" },
      ],
    });
    expect(lines).toHaveLength(2);
    expect(sumPaymentLineAmounts(lines)).toBe(5000);
  });
});

describe("derivePaymentHeaderFromLines", () => {
  it("uses largest line as primary method", () => {
    const header = derivePaymentHeaderFromLines([
      { paymentMethod: "cod", amount: 2000 },
      { paymentMethod: "card", amount: 3000, cardReference: "POS-1" },
    ]);
    expect(header.paymentMethod).toBe("card");
    expect(header.collectedAmount).toBe(5000);
    expect(header.cardReference).toBe("POS-1");
  });
});

describe("cashAmountFromDeliveryPayment", () => {
  it("sums only COD lines for split payments", () => {
    const cash = cashAmountFromDeliveryPayment({
      paymentMethod: "card",
      collectedAmount: 5000,
      lines: [
        { paymentMethod: "cod", amount: 2000 },
        { paymentMethod: "card", amount: 3000 },
      ],
    });
    expect(cash.toString()).toBe("2000");
  });
});
