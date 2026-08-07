import { describe, expect, it } from "vitest";

import {
  brandFromAdaptLineItem,
  brandFromVendorName,
  brandsMatch,
} from "@/lib/customer-insight/brand";

describe("brandFromVendorName", () => {
  it("trims or returns null", () => {
    expect(brandFromVendorName("  Acme  ")).toBe("Acme");
    expect(brandFromVendorName("")).toBeNull();
    expect(brandFromVendorName(null)).toBeNull();
  });
});

describe("brandFromAdaptLineItem", () => {
  it("reads brand/vendor fields", () => {
    expect(brandFromAdaptLineItem({ brand: "OSF" })).toBe("OSF");
    expect(brandFromAdaptLineItem({ vendor: "X" })).toBe("X");
    expect(brandFromAdaptLineItem({ itemName: "No brand" })).toBeNull();
  });
});

describe("brandsMatch", () => {
  it("is case-insensitive and rejects unknown", () => {
    expect(brandsMatch("Acme", "acme")).toBe(true);
    expect(brandsMatch(null, "acme")).toBe(false);
  });
});
