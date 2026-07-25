import { describe, expect, it } from "vitest";

import {
  isLwkLocation,
  lookupLwkErpPrice,
  resolveStickerUnitPrice,
} from "@/lib/sticker-unit-price";

describe("isLwkLocation", () => {
  it("matches LWK reference case-insensitively", () => {
    expect(isLwkLocation("LWK")).toBe(true);
    expect(isLwkLocation(" lwk ")).toBe(true);
    expect(isLwkLocation("003")).toBe(false);
    expect(isLwkLocation("COL")).toBe(false);
  });

  it("matches LWK by location name when reference is numeric", () => {
    expect(isLwkLocation("003", "LWK Enterprises Pvt Ltd")).toBe(true);
    expect(isLwkLocation("003", "Cosmetics.lk")).toBe(false);
    expect(isLwkLocation(null, "lwk shop")).toBe(true);
  });
});

describe("lookupLwkErpPrice", () => {
  it("matches SKU case-insensitively", () => {
    expect(lookupLwkErpPrice({ TRS28_1: "8500.00" }, "trs28_1")).toBe("8500.00");
    expect(lookupLwkErpPrice({ trs28_1: "8500.00" }, "TRS28_1")).toBe("8500.00");
  });
});

describe("resolveStickerUnitPrice", () => {
  it("uses original/list price for non-LWK locations", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: "150.00",
        lwkErpPrice: "120.00",
        isLwk: false,
      })
    ).toBe("150.00");
  });

  it("falls back to sell price when no compare-at on non-LWK", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: null,
        isLwk: false,
      })
    ).toBe("100.00");
  });

  it("uses ERP LWK price for LWK", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: "150.00",
        lwkErpPrice: "120.00",
        isLwk: true,
      })
    ).toBe("120.00");
  });

  it("does not use Cosmo prices when LWK ERP price is missing", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: "150.00",
        lwkErpPrice: null,
        isLwk: true,
      })
    ).toBe("");
  });
});
