import { describe, expect, it } from "vitest";

import {
  findMissingErpInvoiceNames,
  isErpInboundReconcileCandidate,
  mapErpSalesInvoiceResourceToWebhookPayload,
  osLookupKeysForErpInvoice,
} from "@/lib/erp-inbound-invoice-reconcile";
import { erpnextSalesInvoiceWebhookSchema } from "@/lib/validation/erpnext-sales-invoice";
import { buildSalesInvoiceWebhookJson } from "../scripts/erp-webhook-sales-invoice-json.mjs";

describe("isErpInboundReconcileCandidate", () => {
  it("accepts submitted non-return invoices", () => {
    expect(
      isErpInboundReconcileCandidate({
        name: "110-000373",
        docstatus: 1,
        is_return: 0,
      }),
    ).toBe(true);
  });

  it("rejects drafts, returns, and unnamed rows", () => {
    expect(isErpInboundReconcileCandidate({ name: "110-000373", docstatus: 0 })).toBe(false);
    expect(
      isErpInboundReconcileCandidate({ name: "110-000373", docstatus: 1, is_return: 1 }),
    ).toBe(false);
    expect(isErpInboundReconcileCandidate({ docstatus: 1 })).toBe(false);
  });
});

describe("findMissingErpInvoiceNames", () => {
  it("treats erpnextInvoiceId, name, and erp- shopifyOrderId as present", () => {
    expect(
      findMissingErpInvoiceNames(
        ["110-000373", "110-000374"],
        ["110-000374", "erp-110-000372"],
      ),
    ).toEqual(["110-000373"]);
  });

  it("does not flag an invoice already stored as erp- prefixed shopifyOrderId", () => {
    expect(findMissingErpInvoiceNames(["110-000373"], ["erp-110-000373"])).toEqual([]);
  });
});

describe("osLookupKeysForErpInvoice", () => {
  it("includes raw name and erp- prefix", () => {
    const keys = osLookupKeysForErpInvoice("110-000373");
    expect(keys).toEqual(expect.arrayContaining(["110-000373", "erp-110-000373"]));
  });
});

describe("mapErpSalesInvoiceResourceToWebhookPayload", () => {
  it("maps a tab-containing remarks field into a schema-valid payload", () => {
    const mapped = mapErpSalesInvoiceResourceToWebhookPayload({
      name: "110-000373",
      customer: "0771320470",
      customer_name: "Navodya wijerathne",
      company: "DTD Trading (Pvt) Ltd",
      posting_date: "2026-08-29",
      grand_total: 8500,
      net_total: 8500,
      docstatus: 1,
      is_pos: 0,
      is_return: 0,
      custom_special_remarks: "Invoice No\t:\t110-000372 please send together",
      items: [
        {
          item_code: "ANU03_1",
          item_name: "Anua Serum",
          qty: 1,
          rate: 8500,
          amount: 8500,
        },
      ],
    });
    const parsed = erpnextSalesInvoiceWebhookSchema.safeParse(mapped);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.custom_special_remarks).toContain("110-000372");
  });
});

describe("buildSalesInvoiceWebhookJson", () => {
  it("JSON-encodes string fields including special remarks", () => {
    const json = buildSalesInvoiceWebhookJson({ vaultStyle: false });
    expect(json).toContain('"custom_special_remarks": {{ doc.custom_special_remarks | json }}');
    expect(json).toContain('"customer_name": {{ doc.customer_name | json }}');
    expect(json).toContain('"item_name": {{ item.item_name | json }}');
    expect(json).not.toContain("| replace('\\n'");
    expect(json).not.toContain('"{{ doc.custom_special_remarks');
  });
});
