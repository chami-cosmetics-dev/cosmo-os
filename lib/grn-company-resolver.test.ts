import { describe, expect, it } from "vitest";

import { buildGrnCompanyResolver } from "@/lib/grn-company-resolver";

const resolver = buildGrnCompanyResolver([
  {
    id: "kad",
    name: "KAD Trading Lanka (Pvt) Ltd",
    shortName: "KAD",
    erpnextCompany: "KAD Trading Lanka (Pvt) Ltd",
    supplierPrefix: "OUT140",
  },
  {
    id: "usp",
    name: "USP Trading Lanka (Pvt) Ltd",
    shortName: "USP",
    erpnextCompany: "USP Trading Lanka (Pvt) Ltd",
    supplierPrefix: "OUT130",
  },
]);

describe("buildGrnCompanyResolver", () => {
  it("uses the current location name when an old ERP company name is stored", () => {
    expect(
      resolver.displayName({
        documentName: "PR140-0012",
        rawCompany: "KAD Trading (Pvt) Ltd",
      }),
    ).toBe("KAD Trading Lanka (Pvt) Ltd");
    expect(
      resolver.displayName({
        documentName: "SSR130-0012",
        rawCompany: "USP Trading (Pvt) Ltd",
      }),
    ).toBe("USP Trading Lanka (Pvt) Ltd");
  });

  it("resolves intercompany counterparties from their supplier prefixes", () => {
    expect(resolver.resolveSupplierLocation("OUT140")?.name).toBe("KAD Trading Lanka (Pvt) Ltd");
    expect(resolver.resolveSupplierLocation("OUT130 US Products")?.name).toBe("USP Trading Lanka (Pvt) Ltd");
  });
});
