import { describe, expect, it } from "vitest";

import {
  formatFulfillmentOrderReferenceText,
  formatInvoiceOrderReference,
  resolveSourcePrimaryOrderRef,
} from "@/lib/fulfillment-order-reference";

describe("resolveSourcePrimaryOrderRef", () => {
  it("returns Shopify order number for Shopify-origin even when ERP SI exists", () => {
    expect(
      resolveSourcePrimaryOrderRef({
        name: "#1234",
        orderNumber: "1234",
        shopifyOrderId: "gid://shopify/Order/1",
        erpnextInvoiceId: "SV100-0001",
        sourceName: "web",
      })
    ).toBe("#1234");
  });

  it("returns ERP SI for ERP-origin even when Shopify-style refs exist", () => {
    expect(
      resolveSourcePrimaryOrderRef({
        name: "SV100-0002",
        orderNumber: "ALT-1",
        shopifyOrderId: "erp-abc",
        erpnextInvoiceId: "SV100-0002",
        sourceName: "erpnext",
      })
    ).toBe("SV100-0002");
  });

  it("ignores placeholder ERP SI for ERP-origin and falls back", () => {
    expect(
      resolveSourcePrimaryOrderRef({
        name: "SV100-0003",
        erpnextInvoiceId: "pending",
        sourceName: "erpnext-pos",
      })
    ).toBe("SV100-0003");
  });

  it("never returns a dual joined string", () => {
    const value = resolveSourcePrimaryOrderRef({
      name: "#999",
      erpnextInvoiceId: "SV100-9999",
      sourceName: "shopify",
    });
    expect(value.includes(" / ")).toBe(false);
  });
});

describe("formatFulfillmentOrderReferenceText", () => {
  it("returns source-primary single ID (no dual join)", () => {
    expect(
      formatFulfillmentOrderReferenceText({
        name: "#555",
        erpnextInvoiceId: "SV100-0555",
        sourceName: "web",
      })
    ).toBe("#555");

    expect(
      formatFulfillmentOrderReferenceText({
        name: "SV100-0666",
        orderNumber: "OTHER",
        erpnextInvoiceId: "SV100-0666",
        sourceName: "erpnext",
      })
    ).toBe("SV100-0666");
  });
});

describe("formatInvoiceOrderReference (returned-orders dual)", () => {
  it("still exposes shopifyRef, erpRef, and showBoth", () => {
    const refs = formatInvoiceOrderReference({
      name: "#777",
      erpnextInvoiceId: "SV100-0777",
      sourceName: "web",
    });
    expect(refs.shopifyRef).toBe("#777");
    expect(refs.erpRef).toBe("SV100-0777");
    expect(refs.showBoth).toBe(true);
  });
});
