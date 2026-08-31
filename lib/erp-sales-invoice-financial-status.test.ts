import { describe, expect, it } from "vitest";

import { resolveErpSalesInvoiceFinancialStatus } from "@/lib/erp-sales-invoice-financial-status";

describe("resolveErpSalesInvoiceFinancialStatus", () => {
  it("voids cancelled invoices", () => {
    expect(
      resolveErpSalesInvoiceFinancialStatus({
        docstatus: 2,
        isPos: false,
        status: "Cancelled",
        outstandingAmount: 1000,
        grandTotal: 1000,
      }),
    ).toBe("voided");
  });

  it("marks POS and zero-outstanding as paid", () => {
    expect(
      resolveErpSalesInvoiceFinancialStatus({
        docstatus: 1,
        isPos: true,
        status: "Unpaid",
        outstandingAmount: 5000,
        grandTotal: 5000,
      }),
    ).toBe("paid");
    expect(
      resolveErpSalesInvoiceFinancialStatus({
        docstatus: 1,
        isPos: false,
        status: "Paid",
        outstandingAmount: 0,
        grandTotal: 8000,
        paidAmount: 8000,
      }),
    ).toBe("paid");
  });

  it("keeps Unpaid and Overdue as pending even when outstanding is below grand_total", () => {
    expect(
      resolveErpSalesInvoiceFinancialStatus({
        docstatus: 1,
        isPos: false,
        status: "Overdue",
        outstandingAmount: 18005.5,
        grandTotal: 18398,
        paidAmount: 0,
        payments: [],
      }),
    ).toBe("pending");
    expect(
      resolveErpSalesInvoiceFinancialStatus({
        docstatus: 1,
        isPos: false,
        status: "Unpaid",
        outstandingAmount: 12707.5,
        grandTotal: 13350,
        paidAmount: 0,
      }),
    ).toBe("pending");
  });

  it("does not treat coupon-shaped Partly Paid with no receipts as partial", () => {
    expect(
      resolveErpSalesInvoiceFinancialStatus({
        docstatus: 1,
        isPos: false,
        status: "Partly Paid",
        outstandingAmount: 18005.5,
        grandTotal: 18398,
        paidAmount: 0,
        payments: [],
      }),
    ).toBe("pending");
  });

  it("marks genuine part-pay when ERP recorded receipts", () => {
    expect(
      resolveErpSalesInvoiceFinancialStatus({
        docstatus: 1,
        isPos: false,
        status: "Partly Paid",
        outstandingAmount: 5000,
        grandTotal: 8000,
        paidAmount: 3000,
      }),
    ).toBe("partially_paid");
    expect(
      resolveErpSalesInvoiceFinancialStatus({
        docstatus: 1,
        isPos: false,
        status: "Submitted",
        outstandingAmount: 4000,
        grandTotal: 9000,
        payments: [{ amount: 5000 }],
      }),
    ).toBe("partially_paid");
  });
});
