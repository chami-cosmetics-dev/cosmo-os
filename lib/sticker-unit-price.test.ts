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
  it("prefers compare-at over sell price for every location", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: "150.00",
      })
    ).toBe("150.00");
  });

  it("falls back to price when no compare-at", () => {
    expect(
      resolveStickerUnitPrice({
        price: "100.00",
        compareAtPrice: null,
      })
    ).toBe("100.00");
  });
});
