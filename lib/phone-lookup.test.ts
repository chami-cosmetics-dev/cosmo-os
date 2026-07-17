import { describe, expect, it } from "vitest";
import {
  buildPhoneLookupVariants,
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
    expect(variants).toEqual(expect.arrayContaining(["94771234567", "0771234567", "771234567"]));
  });
});
