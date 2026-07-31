import { describe, expect, it } from "vitest";

import { buildAdaptInvoiceKey } from "@/lib/adapt-import/invoice-identity";

describe("buildAdaptInvoiceKey", () => {
  it("prefers sales_invoice_master_id", () => {
    expect(
      buildAdaptInvoiceKey({
        salesInvoiceMasterId: "64",
        salesInvoiceNo: "41061",
        salesLocationId: "1",
        invoiceDate: new Date(2019, 7, 8),
      })
    ).toBe("mid:64");
  });

  it("falls back to composite key", () => {
    expect(
      buildAdaptInvoiceKey({
        salesInvoiceMasterId: null,
        salesInvoiceNo: "41061",
        salesLocationId: "1",
        invoiceDate: new Date(2019, 7, 8),
      })
    ).toBe("cmp:41061|1|2019-08-08");
  });

  it("returns null without enough identity", () => {
    expect(
      buildAdaptInvoiceKey({
        salesInvoiceMasterId: null,
        salesInvoiceNo: null,
        salesLocationId: "1",
        invoiceDate: new Date(2019, 7, 8),
      })
    ).toBeNull();
  });
});
