import { describe, expect, it } from "vitest";

import {
  erpInvoiceIndicatesCreditNote,
  isErpReturnSalesInvoice,
  isErpSalesInvoiceCreditNoted,
  orderMatchesErpInvoiceReference,
} from "@/lib/erp-credit-note-order-sync";
import { erpInvoiceReferenceLookupValues } from "@/lib/erp-invoice-reference";

describe("erp-credit-note-order-sync", () => {
  it("detects return sales invoices", () => {
    expect(isErpReturnSalesInvoice(1, 13225)).toBe(true);
    expect(isErpReturnSalesInvoice(0, -13225)).toBe(true);
    expect(isErpReturnSalesInvoice(0, 13225)).toBe(false);
    expect(isErpReturnSalesInvoice(0, 13225, "SV100-0253")).toBe(true);
    expect(isErpReturnSalesInvoice(0, null, "SV100-0253")).toBe(true);
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

  it("matches orders by dashed and compact ERP invoice refs", () => {
    const where = orderMatchesErpInvoiceReference("SV100-0253");
    const or = where.OR ?? [];
    expect(or).toEqual(
      expect.arrayContaining([
        { erpnextInvoiceId: "SV100-0253" },
        { erpnextInvoiceId: "SV1000253" },
        { name: "SV100-0253" },
        { name: "SV1000253" },
      ]),
    );
    expect(erpInvoiceReferenceLookupValues("SV100-0253")).toEqual([
      "SV100-0253",
      "SV1000253",
    ]);
  });
});
