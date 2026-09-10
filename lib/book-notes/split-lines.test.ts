import { describe, expect, it } from "vitest";

import {
  aggregateSplitLines,
  buildBookNoteErpVerifyRow,
  columnsToSplitLines,
  normalizeBookNoteSplitLines,
} from "@/lib/book-notes/split-lines";

describe("columnsToSplitLines", () => {
  it("maps legacy columns to split lines", () => {
    expect(
      columnsToSplitLines({
        cash: 0,
        card: 15000,
        cardReceiptRefLast4: "1234",
        koko: 0,
        bankTransfer: 0,
      }),
    ).toEqual([
      { paymentMethod: "Card", amount: 15000, cardLast4: "1234" },
    ]);
  });
});

describe("buildBookNoteErpVerifyRow", () => {
  it("uses legacy payload when no split lines", () => {
    expect(
      buildBookNoteErpVerifyRow({
        idx_no: "1",
        sales_invoice: "500-000123",
        cash: 0,
        card: 15000,
        card_last_4: "1234",
        koko: 0,
        bank_transfer: 0,
      }),
    ).toEqual({
      idx_no: "1",
      sales_invoice: "500-000123",
      cash: 0,
      card: 15000,
      card_last_4: "1234",
      koko: 0,
      bank_transfer: 0,
      split_lines: [],
    });
  });

  it("uses split_lines payload when provided", () => {
    expect(
      buildBookNoteErpVerifyRow({
        idx_no: "1",
        sales_invoice: "500-000123",
        cash: 0,
        card: 0,
        koko: 0,
        bank_transfer: 0,
        split_lines: [
          { paymentMethod: "Card", amount: 10000, cardLast4: "1234" },
          { paymentMethod: "Card", amount: 5000, cardLast4: "4334" },
          { paymentMethod: "Cash", amount: 7000 },
        ],
      }),
    ).toEqual({
      idx_no: "1",
      sales_invoice: "500-000123",
      cash: 0,
      card: 0,
      card_last_4: null,
      koko: 0,
      bank_transfer: 0,
      split_lines: [
        { payment_method: "Card", amount: 10000, card_last_4: "1234" },
        { payment_method: "Card", amount: 5000, card_last_4: "4334" },
        { payment_method: "Cash", amount: 7000 },
      ],
    });
  });
});

describe("aggregateSplitLines", () => {
  it("sums amounts by method", () => {
    expect(
      aggregateSplitLines([
        { paymentMethod: "Card", amount: 10000, cardLast4: "1234" },
        { paymentMethod: "Card", amount: 5000, cardLast4: "4334" },
        { paymentMethod: "Cash", amount: 7000 },
      ]),
    ).toEqual({
      cash: 7000,
      card: 15000,
      koko: 0,
      bankTransfer: 0,
      cardReceiptRefLast4: null,
    });
  });
});

describe("normalizeBookNoteSplitLines", () => {
  it("rejects invalid payment method", () => {
    const r = normalizeBookNoteSplitLines([
      { paymentMethod: "card", amount: 100 },
    ]);
    expect(r.ok).toBe(false);
  });
});
