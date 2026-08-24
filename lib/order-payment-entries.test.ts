import { describe, expect, it } from "vitest";

import {
  formatOrderPaymentBreakdown,
  groupSalesInvoiceAllocations,
  resolveOrderPaymentFinancialStatus,
  signedPaymentAmount,
  summarizeOrderPayments,
} from "@/lib/order-payment-entries";

describe("order payment entries", () => {
  it("groups allocations by invoice without using the full paid amount", () => {
    expect(
      groupSalesInvoiceAllocations([
        {
          reference_doctype: "Sales Invoice",
          reference_name: "SV-1",
          allocated_amount: 3000,
        },
        {
          reference_doctype: "Sales Invoice",
          reference_name: "SV-1",
          allocated_amount: 500,
        },
        {
          reference_doctype: "Sales Invoice",
          reference_name: "SV-2",
          allocated_amount: 1500,
        },
        {
          reference_doctype: "Purchase Invoice",
          reference_name: "PI-1",
          allocated_amount: 1000,
        },
      ]),
    ).toEqual([
      { invoiceName: "SV-1", allocatedAmount: 3500 },
      { invoiceName: "SV-2", allocatedAmount: 1500 },
    ]);
  });

  it("stores refunds as negative values", () => {
    expect(signedPaymentAmount(1250, "Receive")).toBe(1250);
    expect(signedPaymentAmount(1250, "Pay")).toBe(-1250);
    expect(signedPaymentAmount(-1250, "Pay")).toBe(-1250);
  });

  it("calculates incoming, refunds, net paid, and balance from allocations", () => {
    expect(
      summarizeOrderPayments(
        [
          { paymentType: "Receive", allocatedAmount: "3000.00" },
          { paymentType: "Receive", allocatedAmount: "5000.00" },
          { paymentType: "Pay", allocatedAmount: "-1000.00" },
        ],
        8000,
      ),
    ).toEqual({
      incomingPaid: 8000,
      refunds: 1000,
      netPaid: 7000,
      balance: 1000,
    });
  });

  it("resolves partial, paid, pending, and voided states", () => {
    expect(
      resolveOrderPaymentFinancialStatus({
        currentStatus: "pending",
        outstandingAmount: 5000,
        incomingPaid: 3000,
        netPaid: 3000,
        invoiceTotal: 8000,
      }),
    ).toBe("partially_paid");
    expect(
      resolveOrderPaymentFinancialStatus({
        currentStatus: "partially_paid",
        outstandingAmount: 0,
        incomingPaid: 8000,
        netPaid: 8000,
        invoiceTotal: 8000,
      }),
    ).toBe("paid");
    expect(
      resolveOrderPaymentFinancialStatus({
        currentStatus: "paid",
        outstandingAmount: 8000,
        incomingPaid: 0,
        netPaid: -1000,
        invoiceTotal: 8000,
      }),
    ).toBe("pending");
    expect(
      resolveOrderPaymentFinancialStatus({
        currentStatus: "voided",
        outstandingAmount: 0,
        incomingPaid: 8000,
        netPaid: 8000,
        invoiceTotal: 8000,
      }),
    ).toBe("voided");
  });

  it("formats the required split-payment label", () => {
    expect(
      formatOrderPaymentBreakdown(
        [
          {
            paymentType: "Receive",
            modeOfPayment: "Bank Transfer",
            allocatedAmount: "3000.00",
          },
          {
            paymentType: "Receive",
            modeOfPayment: "KOKO",
            allocatedAmount: "5000.00",
          },
        ],
        "LKR",
      ),
    ).toBe("Bank Transfer Rs 3,000.00 + KOKO Rs 5,000.00");
  });

  it("labels refunds and formats them as negative", () => {
    expect(
      formatOrderPaymentBreakdown(
        [
          {
            paymentType: "Pay",
            modeOfPayment: "Bank Transfer",
            allocatedAmount: "-1000.00",
          },
        ],
        "LKR",
      ),
    ).toBe("Bank Transfer refund -Rs 1,000.00");
  });
});
