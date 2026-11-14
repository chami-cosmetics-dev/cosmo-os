import { describe, expect, it } from "vitest";

import {
  approvalSplitCashCollectAmount,
  approvalSplitNoteIncludesKoko,
  approvalSplitPairId,
  approvalSplitPrepaidSummary,
  buildApprovalSplitRequestNote,
  buildDefaultOrderPaymentRequestNote,
  formatApprovalSplitAmountBreakdown,
  formatApprovalSplitInvoicePaymentLabel,
  isApprovalSplitRequestNote,
  isCashSplitOrderGateway,
  isSplitPaymentEligibleGateway,
  orderHasSplitPaymentEligibleGateway,
  parseApprovalSplitRequestNote,
  splitPairOptionsForOrder,
  validateApprovalSplitAmounts,
} from "@/lib/approval-payment-split";
import { parseApprovalRequestNote } from "@/lib/approval-display";

describe("split payment eligible gateway", () => {
  it("allows KOKO, Bank Transfer, and Cash/COD", () => {
    expect(isSplitPaymentEligibleGateway("KOKO")).toBe(true);
    expect(isSplitPaymentEligibleGateway("Bank Transfer")).toBe(true);
    expect(isSplitPaymentEligibleGateway("Cash")).toBe(true);
    expect(isSplitPaymentEligibleGateway("Cash On Delivery")).toBe(true);
    expect(isSplitPaymentEligibleGateway("cod")).toBe(true);
    expect(isSplitPaymentEligibleGateway("Mintpay")).toBe(false);
    expect(isSplitPaymentEligibleGateway("Card on Delivery")).toBe(false);
  });

  it("matches primary or names", () => {
    expect(
      orderHasSplitPaymentEligibleGateway({
        paymentGatewayPrimary: "Cash",
        paymentGatewayNames: [],
      }),
    ).toBe(true);
    expect(
      orderHasSplitPaymentEligibleGateway({
        paymentGatewayPrimary: null,
        paymentGatewayNames: ["COD"],
      }),
    ).toBe(true);
    expect(
      orderHasSplitPaymentEligibleGateway({
        paymentGatewayPrimary: "Card on Delivery",
        paymentGatewayNames: [],
      }),
    ).toBe(false);
  });
});

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

  it("accepts Cash + KOKO / Bank / Card / Mintpay pairs", () => {
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
          { paymentMethod: "card", amount: 5000 },
          { paymentMethod: "cash", amount: 2750 },
        ],
        invoiceTotal: 7750,
      }),
    ).toBeNull();
    expect(
      validateApprovalSplitAmounts({
        lines: [
          { paymentMethod: "mintpay", amount: 4500 },
          { paymentMethod: "cash", amount: 3250 },
        ],
        invoiceTotal: 7750,
      }),
    ).toBeNull();
    expect(
      validateApprovalSplitAmounts({
        lines: [
          { paymentMethod: "koko", amount: 3000 },
          { paymentMethod: "card", amount: 4750 },
        ],
        invoiceTotal: 7750,
      }),
    ).toBe(
      "Split payment must be KOKO + Bank Transfer, Cash + KOKO, Cash + Bank Transfer, Cash + Card, or Cash + Mintpay.",
    );
  });

  it("identifies allowed pairs", () => {
    expect(approvalSplitPairId(["koko", "bank_transfer"])).toBe("koko_bank");
    expect(approvalSplitPairId(["cash", "koko"])).toBe("koko_cash");
    expect(approvalSplitPairId(["bank_transfer", "cash"])).toBe("bank_cash");
    expect(approvalSplitPairId(["cash", "card"])).toBe("cash_card");
    expect(approvalSplitPairId(["mintpay", "cash"])).toBe("cash_mintpay");
    expect(approvalSplitPairId(["koko", "koko"])).toBeNull();
  });

  it("detects cash-order gateways and cash-only pair options", () => {
    expect(isCashSplitOrderGateway({ paymentGatewayPrimary: "Cash" })).toBe(true);
    expect(isCashSplitOrderGateway({ paymentGatewayPrimary: "COD" })).toBe(true);
    expect(isCashSplitOrderGateway({ paymentGatewayPrimary: "KOKO" })).toBe(false);
    expect(splitPairOptionsForOrder({ paymentGatewayPrimary: "Cash" })).toEqual([
      "koko_cash",
      "bank_cash",
      "cash_card",
      "cash_mintpay",
    ]);
    expect(splitPairOptionsForOrder({ paymentGatewayPrimary: "KOKO" })).toContain("koko_bank");
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

  it("builds and parses Cash + Card notes", () => {
    const cashCard = buildApprovalSplitRequestNote({
      lines: [
        { paymentMethod: "cash", amount: 2750 },
        { paymentMethod: "card", amount: 5000 },
      ],
      invoiceTotal: 7750,
      currency: "LKR",
    });
    expect(cashCard).toBe(
      [
        "Split Payment — amount: LKR 7750.00",
        "Card: LKR 5000.00",
        "Cash: LKR 2750.00",
      ].join("\n"),
    );
    expect(approvalSplitNoteIncludesKoko(cashCard)).toBe(false);
    expect(parseApprovalSplitRequestNote(cashCard)).toEqual([
      { paymentMethod: "card", amount: 5000 },
      { paymentMethod: "cash", amount: 2750 },
    ]);
    expect(
      approvalSplitCashCollectAmount([
        { paymentMethod: "card", amount: 5000 },
        { paymentMethod: "cash", amount: 2750 },
      ]),
    ).toBe(2750);
    expect(
      formatApprovalSplitInvoicePaymentLabel([
        { paymentMethod: "card", amount: 5000 },
        { paymentMethod: "cash", amount: 2750 },
      ]),
    ).toBe("Card paid — collect cash");
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
    expect(
      approvalSplitCashCollectAmount([
        { paymentMethod: "bank_transfer", amount: 5000 },
        { paymentMethod: "cash", amount: 2750 },
      ]),
    ).toBe(2750);
    expect(
      approvalSplitPrepaidSummary([
        { paymentMethod: "koko", amount: 5000 },
        { paymentMethod: "cash", amount: 15050 },
      ]),
    ).toEqual({ amount: 5000, label: "KOKO" });
    expect(
      formatApprovalSplitAmountBreakdown([
        { paymentMethod: "cash", amount: 3000 },
        { paymentMethod: "koko", amount: 5000 },
      ]),
    ).toBe("KOKO paid 5000.00 + Cash to collect 3000.00");
    expect(
      formatApprovalSplitInvoicePaymentLabel([
        { paymentMethod: "koko", amount: 5750 },
        { paymentMethod: "cash", amount: 2000 },
      ]),
    ).toBe("KOKO paid — collect cash");
    expect(
      formatApprovalSplitInvoicePaymentLabel([
        { paymentMethod: "bank_transfer", amount: 5000 },
        { paymentMethod: "cash", amount: 2750 },
      ]),
    ).toBe("Bank Transfer paid — collect cash");
    expect(
      formatApprovalSplitInvoicePaymentLabel([
        { paymentMethod: "koko", amount: 3000 },
        { paymentMethod: "bank_transfer", amount: 4750 },
      ]),
    ).toBe("KOKO 3000.00 + Bank Transfer 4750.00");
    expect(
      approvalSplitCashCollectAmount([
        { paymentMethod: "koko", amount: 3000 },
        { paymentMethod: "bank_transfer", amount: 4750 },
      ]),
    ).toBeNull();
  });
});
