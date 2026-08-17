import { describe, expect, it } from "vitest";

import {
  ogfPriceForSku,
  resolveProductItemsDisplayedPrice,
} from "@/lib/product-items/list-price";

describe("resolveProductItemsDisplayedPrice", () => {
  it("keeps Standard Selling for non-LWK", () => {
    expect(
      resolveProductItemsDisplayedPrice({
        isLwkView: false,
        catalogPrice: "4900.00",
        ogfPrice: "120.00",
      }),
    ).toEqual({ price: "4900.00", priceDisplay: "4900.00" });
  });

  it("uses OGF on LWK when present", () => {
    expect(
      resolveProductItemsDisplayedPrice({
        isLwkView: true,
        catalogPrice: "4900.00",
        ogfPrice: "120",
      }),
    ).toEqual({ price: "120.00", priceDisplay: "120.00" });
  });

  it("falls back to catalog on LWK when OGF missing", () => {
    expect(
      resolveProductItemsDisplayedPrice({
        isLwkView: true,
        catalogPrice: "4900.00",
        ogfPrice: null,
      }),
    ).toEqual({ price: "4900.00", priceDisplay: "4900.00" });
  });
});

describe("ogfPriceForSku", () => {
  it("matches SKU case-insensitively", () => {
    expect(ogfPriceForSku({ OB0060_1: "99.00" }, "ob0060_1")).toBe("99.00");
  });
});
