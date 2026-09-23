import { describe, expect, it } from "vitest";

import {
  approvalSplitNoteIncludesKoko,
  approvalSplitPairId,
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
        lines: [
          { paymentMethod: "koko", amount: 3000 },
          { paymentMethod: "bank_transfer", amount: 4750 },
        ],
        invoiceTotal: 7750,
      }),
    ).toBeNull();
    expect(
      validateApprovalSplitAmounts({
        lines: [
          { paymentMethod: "koko", amount: 3000 },
          { paymentMethod: "bank_transfer", amount: 4700 },
        ],
        invoiceTotal: 7750,
      }),
    ).toBe("Split payment amounts must equal the invoice total.");
    expect(
      validateApprovalSplitAmounts({
        lines: [
          { paymentMethod: "koko", amount: 0 },
          { paymentMethod: "bank_transfer", amount: 7750 },
        ],
        invoiceTotal: 7750,
      }),
    ).toBe("Both split amounts must be greater than zero.");
  });

  it("accepts KOKO + Cash and Bank Transfer + Cash pairs", () => {
    expect(
      validateApprovalSplitAmounts({
        lines: [
          { paymentMethod: "koko", amount: 3000 },
          { paymentMethod: "cash", amount: 4750 },
        ],
        invoiceTotal: 7750,
      }),
    ).toBeNull();
    expect(
      validateApprovalSplitAmounts({
        lines: [
          { paymentMethod: "bank_transfer", amount: 4000 },
          { paymentMethod: "cash", amount: 3750 },
        ],
        invoiceTotal: 7750,
      }),
    ).toBeNull();
    expect(
      validateApprovalSplitAmounts({
        lines: [
          { paymentMethod: "koko", amount: 3000 },
          { paymentMethod: "mintpay", amount: 4750 },
        ],
        invoiceTotal: 7750,
      }),
    ).toBe(
      "Split payment must be KOKO + Bank Transfer, KOKO + Cash, or Bank Transfer + Cash.",
    );
  });

  it("identifies allowed pairs", () => {
    expect(approvalSplitPairId(["koko", "bank_transfer"])).toBe("koko_bank");
    expect(approvalSplitPairId(["cash", "koko"])).toBe("koko_cash");
    expect(approvalSplitPairId(["bank_transfer", "cash"])).toBe("bank_cash");
    expect(approvalSplitPairId(["koko", "koko"])).toBeNull();
  });

  it("builds a finance-readable note and preserves approval list labels", () => {
    const note = buildApprovalSplitRequestNote({
      lines: [
        { paymentMethod: "koko", amount: 3000 },
        { paymentMethod: "bank_transfer", amount: 4750 },
      ],
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
    expect(parseApprovalSplitRequestNote(note)).toEqual([
      { paymentMethod: "koko", amount: 3000 },
      { paymentMethod: "bank_transfer", amount: 4750 },
    ]);
    expect(
      buildDefaultOrderPaymentRequestNote({
        paymentType: "KOKO",
        invoiceTotal: 7750,
        currency: "LKR",
      }),
    ).toBe("KOKO — amount: LKR 7750");
  });

  it("builds and parses KOKO + Cash and Bank Transfer + Cash notes", () => {
    const kokoCash = buildApprovalSplitRequestNote({
      lines: [
        { paymentMethod: "cash", amount: 2000 },
        { paymentMethod: "koko", amount: 5750 },
      ],
      invoiceTotal: 7750,
      currency: "LKR",
    });
    expect(kokoCash).toBe(
      [
        "Split Payment — amount: LKR 7750.00",
        "KOKO: LKR 5750.00",
        "Cash: LKR 2000.00",
      ].join("\n"),
    );
    expect(approvalSplitNoteIncludesKoko(kokoCash)).toBe(true);
    expect(parseApprovalSplitRequestNote(kokoCash)).toEqual([
      { paymentMethod: "koko", amount: 5750 },
      { paymentMethod: "cash", amount: 2000 },
    ]);

    const bankCash = buildApprovalSplitRequestNote({
      lines: [
        { paymentMethod: "bank_transfer", amount: 5000 },
        { paymentMethod: "cash", amount: 2750 },
      ],
      invoiceTotal: 7750,
      currency: "LKR",
    });
    expect(bankCash).toBe(
      [
        "Split Payment — amount: LKR 7750.00",
        "Bank Transfer: LKR 5000.00",
        "Cash: LKR 2750.00",
      ].join("\n"),
    );
    expect(approvalSplitNoteIncludesKoko(bankCash)).toBe(false);
    expect(parseApprovalSplitRequestNote(bankCash)).toEqual([
      { paymentMethod: "bank_transfer", amount: 5000 },
      { paymentMethod: "cash", amount: 2750 },
    ]);
  });
});
