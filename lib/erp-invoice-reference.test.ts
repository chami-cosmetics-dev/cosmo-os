import { describe, expect, it } from "vitest";

import {
  erpInvoiceReferenceLookupValues,
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
});
