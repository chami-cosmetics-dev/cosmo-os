import { describe, expect, it } from "vitest";

import {
  isLwkLocation,
  resolveStickerUnitPrice,
} from "@/lib/sticker-unit-price";

describe("isLwkLocation", () => {
  it("matches LWK case-insensitively", () => {
    expect(isLwkLocation("LWK")).toBe(true);
    expect(isLwkLocation(" lwk ")).toBe(true);
    expect(isLwkLocation("COL")).toBe(false);
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
