import { describe, expect, it } from "vitest";

import {
  groupCashByErpCompany,
  handoverCashAmount,
  isInvoiceClosed,
  receiptDuplicateDecision,
  shouldCommitInvoiceComplete,
} from "@/lib/rider-handover";

describe("groupCashByErpCompany", () => {
  it("groups by ERP company, drops zero cash, and sums the full total", () => {
    const result = groupCashByErpCompany([
      {
        erpnextCompany: " Cosmetics ",
        locationName: "Shop A",
        payment: { paymentMethod: "cod", collectedAmount: 100 },
      },
      {
        erpnextCompany: "Other Co",
        locationName: "Shop B",
        payment: { paymentMethod: "cod", collectedAmount: 40 },
      },
      {
        erpnextCompany: "Card Co",
        locationName: "Shop C",
        payment: { paymentMethod: "card", collectedAmount: 80 },
      },
      {
        erpnextCompany: "Bank Co",
        locationName: "Shop D",
        payment: { paymentMethod: "bank_transfer", collectedAmount: 25 },
      },
      {
        erpnextCompany: null,
        locationName: "A Shop",
        payment: { paymentMethod: "cod", collectedAmount: 10 },
      },
      {
        erpnextCompany: "Cosmetics",
        locationName: "Shop A",
        payment: {
          paymentMethod: "card",
          collectedAmount: 150,
          lines: [
            { paymentMethod: "cod", amount: 100 },
            { paymentMethod: "card", amount: 50 },
          ],
        },
      },
      {
        erpnextCompany: "Empty",
        locationName: "Nowhere",
        payment: null,
      },
    ]);

    expect(result.companies).toEqual([
      { companyName: "A Shop", cashAmount: "10.00" },
      { companyName: "Cosmetics", cashAmount: "200.00" },
      { companyName: "Other Co", cashAmount: "40.00" },
    ]);
    expect(result.fullTotal).toBe("250.00");
  });
});

describe("handoverCashAmount", () => {
  it("uses the order total when shipping is already included", () => {
    expect(
      handoverCashAmount({
        totalPrice: "11200.00",
        subtotalPrice: "10800.00",
        totalShipping: "400.00",
        paymentGatewayPrimary: "Cash",
      }).toFixed(2),
    ).toBe("11200.00");
  });

  it("adds shipping when the stored total is the order amount only", () => {
    expect(
      handoverCashAmount({
        totalPrice: "10800.00",
        subtotalPrice: "10800.00",
        totalShipping: "400.00",
        paymentGatewayPrimary: "Cash",
      }).toFixed(2),
    ).toBe("11200.00");
  });

  it("leaves prepaid gateways at zero", () => {
    expect(
      handoverCashAmount({
        totalPrice: "4500.00",
        totalShipping: "400.00",
        paymentGatewayPrimary: "KOKO",
      }).toFixed(2),
    ).toBe("0.00");
    expect(
      handoverCashAmount({
        totalPrice: "4500.00",
        totalShipping: "400.00",
        paymentGatewayPrimary: "CC Checkout",
      }).toFixed(2),
    ).toBe("0.00");
  });
});

describe("receiptDuplicateDecision", () => {
  const existing = { id: "r1", fullTotal: "10.00" };

  it("creates when nothing was stored", () => {
    expect(receiptDuplicateDecision({ existing: null, confirmDuplicate: false })).toEqual({
      action: "create",
    });
  });

  it("rejects a second mark until confirm", () => {
    expect(receiptDuplicateDecision({ existing, confirmDuplicate: false })).toEqual({
      action: "reject",
      existing,
    });
  });

  it("creates another row after confirm", () => {
    expect(receiptDuplicateDecision({ existing, confirmDuplicate: true })).toEqual({
      action: "create",
    });
  });
});

describe("isInvoiceClosed", () => {
  it("is true when the stamp or the invoice-complete stage is set", () => {
    expect(isInvoiceClosed({ invoiceCompleteAt: new Date(), fulfillmentStage: "delivery_complete" })).toBe(
      true,
    );
    expect(isInvoiceClosed({ invoiceCompleteAt: null, fulfillmentStage: "invoice_complete" })).toBe(true);
    expect(isInvoiceClosed({ invoiceCompleteAt: null, fulfillmentStage: "delivery_complete" })).toBe(false);
  });
});

describe("shouldCommitInvoiceComplete", () => {
  it("commits only after a payment entry is created or the invoice is already paid", () => {
    expect(shouldCommitInvoiceComplete("created")).toBe(true);
    expect(shouldCommitInvoiceComplete("already_paid")).toBe(true);
    expect(shouldCommitInvoiceComplete("skipped")).toBe(false);
    expect(shouldCommitInvoiceComplete("error")).toBe(false);
  });
});
