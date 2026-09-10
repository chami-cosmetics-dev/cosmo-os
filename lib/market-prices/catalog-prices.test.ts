import { describe, expect, it } from "vitest";

import { derivePriceLayerSnapshot } from "./catalog-prices";

describe("derivePriceLayerSnapshot", () => {
  it("resolves MRP, promo, and OGF when promo is active", () => {
    const snapshot = derivePriceLayerSnapshot({
      compareAtPrice: 9500,
      price: 8200,
      ogfPrice: 7900,
    });

    expect(snapshot).toEqual({
      mrp: 9500,
      promo: 8200,
      ogf: 7900,
      hasPromo: true,
    });
  });

  it("treats equal or higher price as no active promo", () => {
    const equalPrice = derivePriceLayerSnapshot({
      compareAtPrice: 9500,
      price: 9500,
      ogfPrice: 7900,
    });
    expect(equalPrice.hasPromo).toBe(false);
    expect(equalPrice.promo).toBeNull();
    expect(equalPrice.mrp).toBe(9500);

    const higherPrice = derivePriceLayerSnapshot({
      compareAtPrice: 9500,
      price: 10000,
      ogfPrice: null,
    });
    expect(higherPrice.hasPromo).toBe(false);
    expect(higherPrice.promo).toBeNull();
  });

  it("handles null and zero values gracefully", () => {
    const empty = derivePriceLayerSnapshot({
      compareAtPrice: null,
      price: 0,
      ogfPrice: undefined,
    });
    expect(empty).toEqual({
      mrp: null,
      promo: null,
      ogf: null,
      hasPromo: false,
    });
  });
});
