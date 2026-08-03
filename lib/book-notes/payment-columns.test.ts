import { describe, expect, it } from "vitest";

import {
  mapOrderPaymentsToBookNoteColumns,
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
