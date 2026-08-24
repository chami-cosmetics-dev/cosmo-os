import { describe, expect, it } from "vitest";

import {
  buildApprovalSplitRequestNote,
  buildDefaultOrderPaymentRequestNote,
  isApprovalSplitRequestNote,
  parseApprovalSplitRequestNote,
  validateApprovalSplitAmounts,
} from "@/lib/approval-payment-split";
import { parseApprovalRequestNote } from "@/lib/approval-display";

describe("approval split payment plan", () => {
  it("requires two positive amounts that exactly match the invoice total", () => {
    expect(
      validateApprovalSplitAmounts({
        kokoAmount: 3000,
        bankTransferAmount: 4750,
        invoiceTotal: 7750,
      }),
    ).toBeNull();
    expect(
      validateApprovalSplitAmounts({
        kokoAmount: 3000,
        bankTransferAmount: 4700,
        invoiceTotal: 7750,
      }),
    ).toBe("Split payment amounts must equal the invoice total.");
    expect(
      validateApprovalSplitAmounts({
        kokoAmount: 0,
        bankTransferAmount: 7750,
        invoiceTotal: 7750,
      }),
    ).toBe("KOKO and Bank Transfer amounts must both be greater than zero.");
  });

  it("builds a finance-readable note and preserves approval list labels", () => {
    const note = buildApprovalSplitRequestNote({
      kokoAmount: 3000,
      bankTransferAmount: 4750,
      invoiceTotal: 7750,
      currency: "LKR",
    });

    expect(note).toBe(
      [
        "Split Payment — amount: LKR 7750.00",
        "KOKO: LKR 3000.00",
        "Bank Transfer: LKR 4750.00",
      ].join("\n"),
    );
    expect(isApprovalSplitRequestNote(note)).toBe(true);
    expect(parseApprovalRequestNote(note)).toEqual({
      paymentType: "Split Payment",
      amount: "LKR 7750.00",
    });
    expect(parseApprovalSplitRequestNote(note)).toEqual({
      kokoAmount: 3000,
      bankTransferAmount: 4750,
    });
    expect(
      buildDefaultOrderPaymentRequestNote({
        paymentType: "KOKO",
        invoiceTotal: 7750,
        currency: "LKR",
      }),
    ).toBe("KOKO — amount: LKR 7750");
  });
});
