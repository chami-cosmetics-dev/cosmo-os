import { describe, expect, it } from "vitest";

import {
  erpInvoiceIndicatesCreditNote,
  isErpReturnSalesInvoice,
  isErpSalesInvoiceCreditNoted,
} from "@/lib/erp-credit-note-order-sync";

describe("erp-credit-note-order-sync", () => {
  it("detects return sales invoices", () => {
    expect(isErpReturnSalesInvoice(1, 13225)).toBe(true);
    expect(isErpReturnSalesInvoice(0, -13225)).toBe(true);
    expect(isErpReturnSalesInvoice(0, 13225)).toBe(false);
  });

  it("detects credit-noted original invoices", () => {
    expect(isErpSalesInvoiceCreditNoted("Credit Note Issued", 1)).toBe(true);
    expect(isErpSalesInvoiceCreditNoted("Paid", 2)).toBe(true);
    expect(isErpSalesInvoiceCreditNoted("Paid", 1)).toBe(false);
  });

  it("detects credit notes from ERP invoice + linked returns", () => {
    expect(
      erpInvoiceIndicatesCreditNote(
        { status: "Credit Note Issued", docstatus: 1 },
        []
      )
    ).toBe(true);
    expect(
      erpInvoiceIndicatesCreditNote(
        { status: "Paid", docstatus: 1 },
        [{ docstatus: 1 }]
      )
    ).toBe(true);
    expect(
      erpInvoiceIndicatesCreditNote({ status: "Paid", docstatus: 1 }, [])
    ).toBe(false);
  });
});
