import { describe, expect, it } from "vitest";

import {
  dumpInvoiceShippingRuleFromLive,
  dumpInvoiceShippingRuleFromStored,
  dumpShippingPersistFields,
  hasStoredDumpShippingResolution,
  isPlaceholderShippingRule,
} from "@/lib/reports/dump-invoice-shipping";

describe("isPlaceholderShippingRule", () => {
  it("treats None and empty as placeholders", () => {
    expect(isPlaceholderShippingRule("None")).toBe(true);
    expect(isPlaceholderShippingRule("none")).toBe(true);
    expect(isPlaceholderShippingRule("")).toBe(true);
    expect(isPlaceholderShippingRule("Colombo 14 - DTD")).toBe(false);
  });
});

describe("hasStoredDumpShippingResolution", () => {
  it("is stored when POS shipping line is None at $0", () => {
    expect(
      hasStoredDumpShippingResolution({
        sourceName: "erpnext-pos",
        shippingLines: [{ title: "None", code: "None", price: "0", source: "erpnext" }],
      }),
    ).toBe(true);
  });

  it("is stored when ERP payload already has shipping_rule None", () => {
    expect(
      hasStoredDumpShippingResolution({
        sourceName: "erpnext",
        shippingLines: null,
        rawPayload: { shipping_rule: "None" },
      }),
    ).toBe(true);
  });

  it("needs live ERP when Cosmo has no shipping line and no payload rule", () => {
    expect(
      hasStoredDumpShippingResolution({
        sourceName: "erpnext",
        shippingLines: null,
        rawPayload: { name: "010-0020" },
      }),
    ).toBe(false);
  });
});

describe("dumpInvoiceShippingRuleFromStored", () => {
  it("writes blank for POS None $0 shipping, not a live lookup", () => {
    expect(
      dumpInvoiceShippingRuleFromStored({
        sourceName: "erpnext-pos",
        shippingLines: [{ title: "None", code: "None", price: "0", source: "erpnext" }],
        dispatchedToCustomer: false,
      }),
    ).toBe("");
  });

  it("keeps a real $0 shipping title instead of stripping it", () => {
    expect(
      dumpInvoiceShippingRuleFromStored({
        sourceName: "web",
        shippingLines: [{ title: "Standard Shipping", price: "0.00" }],
      }),
    ).toBe("Standard Shipping");
  });

  it("normalizes $0 pickup titles", () => {
    expect(
      dumpInvoiceShippingRuleFromStored({
        sourceName: "web",
        shippingLines: [{ title: "Store Pick Up", price: "0.00" }],
      }),
    ).toBe("Pick Up");
  });

  it("uses pickup fallback when stored line is None", () => {
    expect(
      dumpInvoiceShippingRuleFromStored({
        sourceName: "erpnext-pos",
        shippingLines: [{ title: "None", price: "0" }],
        dispatchedToCustomer: true,
      }),
    ).toBe("Pick Up");
  });

  it("reads a real ERP payload shipping_rule when lines are missing", () => {
    expect(
      dumpInvoiceShippingRuleFromStored({
        sourceName: "erpnext",
        shippingLines: null,
        rawPayload: {
          shipping_rule: "Veyangoda - DTD",
          taxes: [{ description: "Veyangoda - DTD", tax_amount: 400 }],
        },
      }),
    ).toBe("Veyangoda - DTD");
  });
});

describe("dumpInvoiceShippingRuleFromLive", () => {
  it("uses a real live rule and blanks None", () => {
    expect(
      dumpInvoiceShippingRuleFromLive({ label: "Colombo 14 - DTD", amount: "300.00" }, ""),
    ).toBe("Colombo 14 - DTD");
    expect(
      dumpInvoiceShippingRuleFromLive({ label: "None", amount: null }, "Pick Up"),
    ).toBe("Pick Up");
  });
});

describe("dumpShippingPersistFields", () => {
  it("builds webhook-shaped shippingLines from a live ERP fill", () => {
    expect(
      dumpShippingPersistFields({ label: "Colombo 14 - DTD", amount: "300.00" }),
    ).toEqual({
      totalShipping: "300.00",
      shippingLines: [
        {
          title: "Colombo 14 - DTD",
          code: "Colombo 14 - DTD",
          price: "300.00",
          source: "erpnext",
        },
      ],
    });
  });

  it("stores None sentinel so the next dump skips ERP", () => {
    expect(dumpShippingPersistFields({ label: "None", amount: null })).toEqual({
      totalShipping: null,
      shippingLines: [
        {
          title: "None",
          code: "None",
          price: "0",
          source: "erpnext",
        },
      ],
    });
  });

  it("skips persist when live fetch returned nothing", () => {
    expect(dumpShippingPersistFields({ label: null, amount: null })).toBeNull();
  });
});
