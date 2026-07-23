import { describe, expect, it } from "vitest";

import {
  erpDrivenCancelFields,
  erpInvoiceIndicatesCreditNote,
  isErpReturnSalesInvoice,
  isErpSalesInvoiceCancelled,
  isErpSalesInvoiceCreditNoted,
  orderMatchesErpInvoiceReference,
  resolveOrderCancelledByLabel,
} from "@/lib/erp-credit-note-order-sync";
import { mergeErpReturnSalesInvoiceIds } from "@/lib/erp-return-si";
import { erpInvoiceReferenceLookupValues } from "@/lib/erp-invoice-reference";

describe("erp-credit-note-order-sync", () => {
  it("detects return sales invoices", () => {
    expect(isErpReturnSalesInvoice(1, 13225)).toBe(true);
    expect(isErpReturnSalesInvoice(0, -13225)).toBe(true);
    expect(isErpReturnSalesInvoice(0, 13225)).toBe(false);
    expect(isErpReturnSalesInvoice(0, 13225, "SV100-0253")).toBe(true);
    expect(isErpReturnSalesInvoice(0, null, "SV100-0253")).toBe(true);
  });

  it("detects credit notes without treating ERP cancel as credit note", () => {
    expect(isErpSalesInvoiceCreditNoted("Credit Note Issued", 1)).toBe(true);
    expect(isErpSalesInvoiceCreditNoted("Paid", 2)).toBe(false);
    expect(isErpSalesInvoiceCreditNoted("Cancelled", 2)).toBe(false);
    expect(isErpSalesInvoiceCreditNoted("Paid", 1)).toBe(false);
    expect(isErpSalesInvoiceCancelled(2)).toBe(true);
    expect(isErpSalesInvoiceCancelled(1)).toBe(false);
  });

  it("labels cancel actor as ERP when no OS user", () => {
    expect(resolveOrderCancelledByLabel(null)).toBe("ERP");
    expect(resolveOrderCancelledByLabel({ name: null, email: null })).toBe("ERP");
    expect(resolveOrderCancelledByLabel({ name: "Ada", email: "a@x.com" })).toBe("Ada");
    expect(resolveOrderCancelledByLabel({ name: "  ", email: "a@x.com" })).toBe("a@x.com");
  });

  it("erpDrivenCancelFields fills gaps only", () => {
    const now = new Date("2026-07-08T11:57:15.382Z");
    expect(
      erpDrivenCancelFields({
        cancelledAt: null,
        cancelReason: null,
        reason: "ERP credit note",
        now,
      }),
    ).toEqual({ cancelledAt: now, cancelReason: "ERP credit note" });
    expect(
      erpDrivenCancelFields({
        cancelledAt: now,
        cancelReason: "already set",
        reason: "ERP credit note",
        now,
      }),
    ).toEqual({});
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
    expect(
      erpInvoiceIndicatesCreditNote({ status: "Cancelled", docstatus: 2 }, [])
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

  it("appends and dedupes Return SI ids for writer path", () => {
    expect(mergeErpReturnSalesInvoiceIds(["ACC-R1"], "ACC-R1")).toEqual(["ACC-R1"]);
    expect(mergeErpReturnSalesInvoiceIds(["ACC-R1"], "ACC-R2")).toEqual(["ACC-R1", "ACC-R2"]);
  });
});
