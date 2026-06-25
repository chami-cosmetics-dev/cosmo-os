import { describe, expect, it } from "vitest";

import {
  mapErpSalesInvoiceToWebhookPayload,
  shouldSkipErpSalesInvoiceForMissingImport,
} from "@/lib/erp-missing-order-audit";

describe("shouldSkipErpSalesInvoiceForMissingImport", () => {
  it("skips return and credit-noted invoices", () => {
    expect(
      shouldSkipErpSalesInvoiceForMissingImport({
        name: "SV300-0001",
        company: "AE (PVT) LTD",
        docstatus: 1,
        is_return: 1,
        return_against: "SV300-0000",
      }),
    ).toBe(true);

    expect(
      shouldSkipErpSalesInvoiceForMissingImport({
        name: "SV300-0002",
        company: "AE (PVT) LTD",
        docstatus: 1,
        status: "Credit Note Issued",
      }),
    ).toBe(true);
  });

  it("keeps normal submitted invoices", () => {
    expect(
      shouldSkipErpSalesInvoiceForMissingImport({
        name: "SV300-0116",
        company: "AE (PVT) LTD",
        docstatus: 1,
        status: "Overdue",
      }),
    ).toBe(false);
  });
});

describe("mapErpSalesInvoiceToWebhookPayload", () => {
  it("maps line items and payment fields for webhook replay", () => {
    const payload = mapErpSalesInvoiceToWebhookPayload({
      name: "SV200-0045",
      customer: "0753463704",
      customer_name: "Salman Faris",
      company: "Origins (PVT) LTD",
      docstatus: 1,
      grand_total: 36860,
      custom_payment_type: "Cash",
      items: [
        {
          item_code: "RE002-1",
          item_name: "Relumins",
          qty: 1,
          rate: 28760,
        },
      ],
      payments: [],
      taxes: [],
    });

    expect(payload.name).toBe("SV200-0045");
    expect(payload.custom_payment_type).toBe("Cash");
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0]?.item_code).toBe("RE002-1");
  });
});
