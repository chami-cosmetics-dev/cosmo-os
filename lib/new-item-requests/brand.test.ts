import { describe, expect, it } from "vitest";

import {
  brandPriorityFromItemStatuses,
  canSuggestBrands,
  isExistingVendorName,
  normalizeBrandName,
  toStoredBrand,
} from "@/lib/new-item-requests/brand";

describe("normalizeBrandName", () => {
  it("trims, collapses whitespace, and lower-cases", () => {
    expect(normalizeBrandName("  The   Ordinary ")).toBe("the ordinary");
  });
});

describe("canSuggestBrands", () => {
  it("rejects a one-character query", () => {
    expect(canSuggestBrands("T")).toBe(false);
    expect(canSuggestBrands("  a ")).toBe(false);
  });

  it("accepts two or more characters", () => {
    expect(canSuggestBrands("Th")).toBe(true);
  });
});

describe("isExistingVendorName", () => {
  it("matches vendor names without caring about case", () => {
    expect(isExistingVendorName("the ordinary", "The Ordinary")).toBe(true);
    expect(isExistingVendorName("THE ORDINARY", "The Ordinary")).toBe(true);
  });

  it("is false when there is no vendor", () => {
    expect(isExistingVendorName("New Brand", null)).toBe(false);
  });
});

describe("toStoredBrand", () => {
  it("stores the vendor’s actual name when existing", () => {
    expect(toStoredBrand({ vendorName: "The Ordinary", typedName: "the ordinary" })).toEqual({
      brandName: "The Ordinary",
      brandNameNormalized: "the ordinary",
      brandIsExisting: true,
    });
  });

  it("stores the trimmed typed name when new", () => {
    expect(toStoredBrand({ vendorName: null, typedName: "  New Brand " })).toEqual({
      brandName: "New Brand",
      brandNameNormalized: "new brand",
      brandIsExisting: false,
    });
  });
});

describe("brandPriorityFromItemStatuses", () => {
  it("picks Top Priority Brand over Priority Brand and Standard", () => {
    expect(
      brandPriorityFromItemStatuses([
        "PRIORITY_BRAND_PRIORITY_PRODUCT",
        "TOP_PRIORITY_BRAND_NON_PRIORITY_PRODUCT",
        "CONTINUE",
      ]),
    ).toBe("Top Priority Brand");
  });

  it("returns null when there are no statuses", () => {
    expect(brandPriorityFromItemStatuses([])).toBeNull();
  });

  it("maps Continue items to Standard", () => {
    expect(brandPriorityFromItemStatuses(["CONTINUE"])).toBe("Standard");
  });
});
