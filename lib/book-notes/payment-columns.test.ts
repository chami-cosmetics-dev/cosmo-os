import { describe, expect, it } from "vitest";

import {
  mapOrderPaymentsToBookNoteColumns,
  mapOrderPaymentsToBookNoteSuggestion,
  mopToBookNoteBucket,
} from "@/lib/book-notes/payment-columns";

describe("mopToBookNoteBucket", () => {
  it("maps koko/cash/card/bank", () => {
    expect(mopToBookNoteBucket("Koko")).toBe("koko");
    expect(mopToBookNoteBucket("Cash")).toBe("cash");
    expect(mopToBookNoteBucket("Credit Card")).toBe("card");
    expect(mopToBookNoteBucket("Wire Transfer")).toBe("bankTransfer");
  });
});

describe("mapOrderPaymentsToBookNoteColumns", () => {
  it("splits rawPayload payments", () => {
    const cols = mapOrderPaymentsToBookNoteColumns({
      totalPrice: 800,
      rawPayload: {
        payments: [
          { mode_of_payment: "Cash", amount: 500 },
          { mode_of_payment: "Wire Transfer", amount: 300 },
        ],
      },
    });
    expect(cols).toEqual({ cash: 500, card: 0, koko: 0, bankTransfer: 300 });
  });

  it("puts total into primary gateway column when no payments array", () => {
    const cols = mapOrderPaymentsToBookNoteColumns({
      totalPrice: 1200,
      paymentGatewayPrimary: "Koko",
      paymentGatewayNames: ["Koko"],
    });
    expect(cols).toEqual({ cash: 0, card: 0, koko: 1200, bankTransfer: 0 });
  });

  it("falls back unmapped primary to Cash", () => {
    const cols = mapOrderPaymentsToBookNoteColumns({
      totalPrice: 99,
      paymentGatewayPrimary: "SomeUnknownGateway",
    });
    expect(cols.cash).toBe(99);
  });
});

describe("mapOrderPaymentsToBookNoteSuggestion", () => {
  it("prefers two ERP payment entries over primary card total", () => {
    const mapped = mapOrderPaymentsToBookNoteSuggestion({
      totalPrice: 30890,
      paymentGatewayPrimary: "Credit Card",
      paymentEntries: [
        { paymentType: "Receive", modeOfPayment: "Cash", allocatedAmount: 28000 },
        {
          paymentType: "Receive",
          modeOfPayment: "Credit Card",
          allocatedAmount: 2890,
        },
      ],
    });
    expect(mapped.columns).toEqual({
      cash: 28000,
      card: 2890,
      koko: 0,
      bankTransfer: 0,
    });
    expect(mapped.splitLines).toBeNull();
  });

  it("opens split lines for two card payment entries", () => {
    const mapped = mapOrderPaymentsToBookNoteSuggestion({
      totalPrice: 15000,
      paymentGatewayPrimary: "Credit Card",
      paymentEntries: [
        { paymentType: "Receive", modeOfPayment: "Credit Card", allocatedAmount: 10000 },
        { paymentType: "Receive", modeOfPayment: "Credit Card", allocatedAmount: 5000 },
      ],
    });
    expect(mapped.columns.card).toBe(15000);
    expect(mapped.splitLines).toEqual([
      { paymentMethod: "Card", amount: 10000 },
      { paymentMethod: "Card", amount: 5000 },
    ]);
  });

  it("ignores Pay refunds and does not split a single receive", () => {
    const mapped = mapOrderPaymentsToBookNoteSuggestion({
      totalPrice: 5900,
      paymentGatewayPrimary: "KOKO",
      paymentEntries: [
        { paymentType: "Receive", modeOfPayment: "KOKO", allocatedAmount: 5900 },
        { paymentType: "Pay", modeOfPayment: "KOKO", allocatedAmount: 500 },
      ],
    });
    expect(mapped.columns).toEqual({
      cash: 0,
      card: 0,
      koko: 5900,
      bankTransfer: 0,
    });
    expect(mapped.splitLines).toBeNull();
  });

  it("uses POS payments[] when no ERP payment entries", () => {
    const mapped = mapOrderPaymentsToBookNoteSuggestion({
      totalPrice: 800,
      paymentGatewayPrimary: "Cash",
      rawPayload: {
        payments: [
          { mode_of_payment: "Cash", amount: 500 },
          { mode_of_payment: "Wire Transfer", amount: 300 },
        ],
      },
    });
    expect(mapped.columns).toEqual({
      cash: 500,
      card: 0,
      koko: 0,
      bankTransfer: 300,
    });
    expect(mapped.splitLines).toBeNull();
  });
});
