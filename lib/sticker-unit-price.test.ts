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
  it("prefers compare-at over sell price when not LWK", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: "150.00",
        isLwk: false,
      })
    ).toBe("150.00");
  });

  it("falls back to price when no compare-at", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: null,
        isLwk: false,
      })
    ).toBe("100.00");
  });

  it("uses ogfPrice for LWK", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: "150.00",
        ogfPrice: "120.00",
        isLwk: true,
      })
    ).toBe("120.00");
  });

  it("does not use discount price when LWK ogf missing", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: "150.00",
        ogfPrice: null,
        isLwk: true,
      })
    ).toBe("");
  });
});
