import { describe, expect, it } from "vitest";

import {
  applyBestDiscountToListRate,
  applyBestDiscountToProductItems,
  bestDiscountPercent,
  computedTotalsMatchShopify,
  discountedRate,
} from "@/lib/erp-best-discount";

describe("bestDiscountPercent", () => {
  it("uses tabloid 30% over SV10 10% (GABA)", () => {
    expect(bestDiscountPercent(10, 30)).toBe(30);
    expect(applyBestDiscountToListRate({ listRate: 10950, couponPercent: 10, itemPromoPercent: 30 })).toEqual({
      appliedPercent: 30,
      rate: 7665,
    });
  });

  it("uses SV20 20% over tabloid 10%", () => {
    expect(bestDiscountPercent(20, 10)).toBe(20);
    expect(applyBestDiscountToListRate({ listRate: 10950, couponPercent: 20, itemPromoPercent: 10 })).toEqual({
      appliedPercent: 20,
      rate: 8760,
    });
  });

  it("uses coupon on items with no tabloid rule", () => {
    expect(bestDiscountPercent(10, 0)).toBe(10);
    expect(applyBestDiscountToListRate({ listRate: 9950, couponPercent: 10, itemPromoPercent: 0 })).toEqual({
      appliedPercent: 10,
      rate: 8955,
    });
  });

  it("does not stack 10% + 30%", () => {
    expect(bestDiscountPercent(10, 30)).not.toBe(40);
    expect(discountedRate(10950, 40)).toBe(6570);
    expect(discountedRate(10950, 30)).toBe(7665);
  });
});

describe("applyBestDiscountToProductItems", () => {
  it("prices GABA at 30% and others at coupon 10% from MRP", () => {
    const items = [
      { item_code: "NW049-2", qty: 1, rate: 7665 },
      { item_code: "WN002-1", qty: 1, rate: 9950 },
      { item_code: "SHIP", qty: 1, rate: 400 },
    ];
    const priced = applyBestDiscountToProductItems(items, {
      couponPercent: 10,
      itemPromoBySku: new Map([["NW049-2", 30]]),
      listRateBySku: new Map([
        ["NW049-2", 10950],
        ["WN002-1", 9950],
      ]),
    });
    expect(priced[0]).toMatchObject({ item_code: "NW049-2", rate: 7665, price_list_rate: 10950 });
    expect(priced[1]).toMatchObject({ item_code: "WN002-1", rate: 8955, price_list_rate: 9950 });
    expect(priced[2]).toMatchObject({ item_code: "SHIP", rate: 400 });
  });
});

describe("computedTotalsMatchShopify", () => {
  it("accepts the SV10 + tabloid GABA basket (73900)", () => {
    // 7665 + 8955 + 35550 + 21330 + 400 shipping
    expect(computedTotalsMatchShopify(73900, 73900)).toBe(true);
  });

  it("rejects ERP coupon-only GABA total 76090 vs Shopify 73900", () => {
    expect(computedTotalsMatchShopify(76090, 73900)).toBe(false);
  });
});
