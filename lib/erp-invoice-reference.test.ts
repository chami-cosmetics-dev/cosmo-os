import { describe, expect, it } from "vitest";

import {
  erpInvoiceReferenceLookupValues,
  erpPoNoLookupValues,
  normalizeErpInvoiceReference,
} from "@/lib/erp-invoice-reference";

describe("erp-invoice-reference", () => {
  it("normalizes dashes and spaces", () => {
    expect(normalizeErpInvoiceReference(" SV100-0253 ")).toBe("SV1000253");
    expect(normalizeErpInvoiceReference("#SV100 0253")).toBe("SV1000253");
  });

  it("returns dashed and compact lookup values", () => {
    expect(erpInvoiceReferenceLookupValues("SV100-0253")).toEqual([
      "SV100-0253",
      "SV1000253",
    ]);
  });

  it("adds hashed Shopify name variants for po_no", () => {
    expect(erpPoNoLookupValues("60020348")).toEqual(
      expect.arrayContaining(["60020348", "#60020348"]),
    );
    expect(erpPoNoLookupValues("#60020348")).toEqual(
      expect.arrayContaining(["60020348", "#60020348"]),
    );
  });
});
