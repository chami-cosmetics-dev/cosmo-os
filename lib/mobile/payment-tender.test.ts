import { describe, expect, it } from "vitest";

import {
  assertCustomerGaveCoversCashDue,
  cashDueFromPayment,
  computeChangeAmount,
} from "@/lib/mobile/payment-tender";

describe("cashDueFromPayment", () => {
  it("uses COD line amounts for split payments", () => {
    const due = cashDueFromPayment({
      paymentMethod: "card",
      collectedAmount: 5000,
      lines: [
        { paymentMethod: "cod", amount: 2000 },
        { paymentMethod: "card", amount: 3000 },
      ],
    });
    expect(due.toString()).toBe("2000");
  });

  it("uses collectedAmount for single COD", () => {
    expect(
      cashDueFromPayment({ paymentMethod: "cod", collectedAmount: 3500 }).toString()
    ).toBe("3500");
  });
});

describe("computeChangeAmount", () => {
  it("computes change for overpay", () => {
    expect(computeChangeAmount(5000, 3500).toString()).toBe("1500");
  });

  it("computes change for 2500 due / 5000 gave", () => {
    expect(computeChangeAmount(5000, 2500).toString()).toBe("2500");
  });
});

describe("assertCustomerGaveCoversCashDue", () => {
  it("requires tender when cash due", () => {
    expect(assertCustomerGaveCoversCashDue({ customerGaveAmount: null, cashDue: 3500 }).ok).toBe(
      false
    );
    expect(assertCustomerGaveCoversCashDue({ customerGaveAmount: 5000, cashDue: 3500 })).toEqual({
      ok: true,
      customerGave: 5000,
      change: 1500,
    });
  });
});
