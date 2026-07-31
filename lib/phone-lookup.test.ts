import { describe, expect, it } from "vitest";
import {
  buildPhoneLookupVariants,
  buildPhoneSearchSuffixes,
  canonicalPhoneForErpCustomerId,
  normalizeOrderCustomerPhone,
} from "@/lib/phone-lookup";

describe("canonicalPhoneForErpCustomerId", () => {
  it("keeps valid local 10-digit numbers", () => {
    expect(canonicalPhoneForErpCustomerId("0771234567")).toBe("0771234567");
  });

  it("prepends 0 for 9-digit local numbers", () => {
    expect(canonicalPhoneForErpCustomerId("771234567")).toBe("0771234567");
  });

  it("converts +94 / 94 country-code forms", () => {
    expect(canonicalPhoneForErpCustomerId("+94771234567")).toBe("0771234567");
    expect(canonicalPhoneForErpCustomerId("94771234567")).toBe("0771234567");
    expect(canonicalPhoneForErpCustomerId("+94 77 123 4567")).toBe("0771234567");
    expect(canonicalPhoneForErpCustomerId("940771234567")).toBe("0771234567");
    expect(canonicalPhoneForErpCustomerId("0094771234567")).toBe("0771234567");
  });

  it("collapses extra leading zeros", () => {
    expect(canonicalPhoneForErpCustomerId("00771234567")).toBe("0771234567");
  });

  it("returns null for numbers that cannot be safely corrected", () => {
    expect(canonicalPhoneForErpCustomerId("")).toBeNull();
    expect(canonicalPhoneForErpCustomerId("123")).toBeNull();
    expect(canonicalPhoneForErpCustomerId("7712345678")).toBeNull();
    expect(canonicalPhoneForErpCustomerId("947712345678")).toBeNull();
  });
});

describe("normalizeOrderCustomerPhone", () => {
  it("stores corrected local format when possible", () => {
    expect(normalizeOrderCustomerPhone("+94 771 234 567")).toBe("0771234567");
  });

  it("keeps original trimmed value when uncorrectable", () => {
    expect(normalizeOrderCustomerPhone("7712345678")).toBe("7712345678");
  });
});

describe("buildPhoneLookupVariants", () => {
  it("includes local and country-code variants for matching", () => {
    const variants = buildPhoneLookupVariants("+94771234567");
    expect(variants).toEqual(
      expect.arrayContaining(["94771234567", "0771234567", "771234567", "+94771234567"]),
    );
  });

  it("matches local 0-prefix query to +94 stored form", () => {
    const variants = buildPhoneLookupVariants("0717106114");
    expect(variants).toEqual(
      expect.arrayContaining([
        "0717106114",
        "717106114",
        "94717106114",
        "+94717106114",
      ]),
    );
  });

  it("matches without leading 0", () => {
    const variants = buildPhoneLookupVariants("717106114");
    expect(variants).toEqual(
      expect.arrayContaining(["0717106114", "94717106114", "+94717106114"]),
    );
  });
});

describe("buildPhoneSearchSuffixes", () => {
  it("includes last-4 and local suffixes for endsWith search", () => {
    const suffixes = buildPhoneSearchSuffixes("0717106114");
    expect(suffixes).toEqual(expect.arrayContaining(["6114", "717106114", "0717106114"]));
  });
});
