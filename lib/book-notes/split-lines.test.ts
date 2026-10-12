import { describe, expect, it } from "vitest";

import {
  aggregateSplitLines,
  buildBookNoteErpVerifyRow,
  columnsToSplitLines,
  mintpayReferenceDigitWarning,
  normalizeBookNoteSplitLines,
  normalizeKokoOrderReference,
  normalizeMintpayReference,
} from "@/lib/book-notes/split-lines";

describe("columnsToSplitLines", () => {
  it("maps legacy columns to split lines", () => {
    expect(
      columnsToSplitLines({
        cash: 0,
        card: 15000,
        cardReceiptRefLast4: "1234",
        koko: 0,
        mintpay: 0,
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
        mintpay: 0,
        bank_transfer: 0,
      }),
    ).toEqual({
      idx_no: "1",
      sales_invoice: "500-000123",
      cash: 0,
      card: 15000,
      card_last_4: "1234",
      koko: 0,
      mintpay: 0,
      mintpay_reference: null,
      bank_transfer: 0,
      split_lines: [],
    });
  });

  it("turns a KOKO column amount into a split line with the order reference", () => {
    expect(normalizeKokoOrderReference("  #11465305 ")).toBe("#11465305");
    expect(normalizeKokoOrderReference("ORDER 11465305")).toBe("ORDER11465305");
    expect(
      buildBookNoteErpVerifyRow({
        idx_no: "3",
        sales_invoice: "400-000401",
        cash: 0,
        card: 4450,
        card_last_4: "3109",
        koko: 13000,
        koko_reference: "00011465305",
        mintpay: 0,
        bank_transfer: 0,
      }),
    ).toEqual({
      idx_no: "3",
      sales_invoice: "400-000401",
      cash: 0,
      card: 4450,
      card_last_4: "3109",
      koko: 13000,
      mintpay: 0,
      mintpay_reference: null,
      bank_transfer: 0,
      split_lines: [
        { payment_method: "Card", amount: 4450, card_last_4: "3109" },
        {
          payment_method: "KOKO",
          amount: 13000,
          koko_reference: "00011465305",
        },
      ],
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
        mintpay: 0,
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
      mintpay: 0,
      mintpay_reference: null,
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
      mintpay: 0,
      bankTransfer: 0,
      cardReceiptRefLast4: null,
    });
  });
});

describe("MintPay verify payload", () => {
  it("sends a MintPay-only row with the Order ID on the split line and the flat key", () => {
    expect(normalizeMintpayReference(" #3174628 ")).toBe("#3174628");
    expect(mintpayReferenceDigitWarning("3174628")).toBe(false);
    expect(mintpayReferenceDigitWarning("123")).toBe(true);
    expect(mintpayReferenceDigitWarning("")).toBe(false);
    expect(
      buildBookNoteErpVerifyRow({
        idx_no: "1",
        sales_invoice: "500-000888",
        cash: 0,
        card: 0,
        koko: 0,
        mintpay: 8950,
        mintpay_reference: " #3174628 ",
        bank_transfer: 0,
      }),
    ).toEqual({
      idx_no: "1",
      sales_invoice: "500-000888",
      cash: 0,
      card: 0,
      card_last_4: null,
      koko: 0,
      mintpay: 8950,
      mintpay_reference: "#3174628",
      bank_transfer: 0,
      split_lines: [
        {
          payment_method: "MintPay",
          amount: 8950,
          mintpay_reference: "#3174628",
        },
      ],
    });
  });

  it("sends Cash + MintPay and Card + MintPay split lines", () => {
    expect(
      buildBookNoteErpVerifyRow({
        idx_no: "2",
        sales_invoice: "500-000889",
        cash: 0,
        card: 0,
        koko: 0,
        mintpay: 0,
        bank_transfer: 0,
        split_lines: [
          { paymentMethod: "Cash", amount: 1000 },
          {
            paymentMethod: "MintPay",
            amount: 7950,
            mintpayReference: "3174682",
          },
        ],
      }).split_lines,
    ).toEqual([
      { payment_method: "Cash", amount: 1000 },
      {
        payment_method: "MintPay",
        amount: 7950,
        mintpay_reference: "3174682",
      },
    ]);

    expect(
      buildBookNoteErpVerifyRow({
        idx_no: "3",
        sales_invoice: "500-000890",
        cash: 0,
        card: 0,
        koko: 0,
        mintpay: 0,
        bank_transfer: 0,
        split_lines: [
          { paymentMethod: "Card", amount: 5000, cardLast4: "0301" },
          {
            paymentMethod: "MintPay",
            amount: 4500,
            mintpayReference: "3175577",
          },
        ],
      }).split_lines,
    ).toEqual([
      { payment_method: "Card", amount: 5000, card_last_4: "0301" },
      {
        payment_method: "MintPay",
        amount: 4500,
        mintpay_reference: "3175577",
      },
    ]);
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
