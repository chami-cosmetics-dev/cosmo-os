import { describe, expect, it } from "vitest";

import {
  getDiscountCouponCode,
  isFreeShippingDiscountCode,
  isMerchantTrackingDiscountCode,
  orderHasFreeShippingCoupon,
  parseShopifyDiscountCodes,
  splitShopifyDiscountCodes,
} from "@/lib/shopify-discount-codes";

describe("shopify-discount-codes", () => {
  it("parses Shopify discount code rows", () => {
    expect(
      parseShopifyDiscountCodes([
        { code: "SV20", amount: "5990.00" },
        { code: "MER99", amount: "0.00" },
      ]),
    ).toEqual([
      { code: "SV20", amount: 5990 },
      { code: "MER99", amount: 0 },
    ]);
  });

  it("treats MER and zero-amount codes as merchant tracking", () => {
    expect(isMerchantTrackingDiscountCode({ code: "MER99", amount: 0 })).toBe(true);
    expect(isMerchantTrackingDiscountCode({ code: "SV20", amount: 5990 })).toBe(false);
  });

  it("picks SV20 as discount when paired with MER99", () => {
    const codes = [
      { code: "SV20", amount: "3700.00" },
      { code: "MER99", amount: "0.00" },
    ];
    expect(getDiscountCouponCode(codes)).toBe("SV20");
    expect(splitShopifyDiscountCodes(codes)).toEqual({
      merchantCode: "MER99",
      discountCode: "SV20",
    });
  });

  it("returns SV20 as discount for single-code orders", () => {
    expect(getDiscountCouponCode([{ code: "SV20", amount: "7800.00" }])).toBe("SV20");
    expect(splitShopifyDiscountCodes([{ code: "SV20", amount: "7800.00" }])).toEqual({
      merchantCode: null,
      discountCode: "SV20",
    });
  });

  it("prefers non-MER code when Shopify reports discount amount on MER row", () => {
    const codes = [
      { code: "SV20", amount: "0.00" },
      { code: "MER99", amount: "3980.00" },
    ];
    expect(getDiscountCouponCode(codes)).toBe("SV20");
    expect(splitShopifyDiscountCodes(codes)).toEqual({
      merchantCode: "MER99",
      discountCode: "SV20",
    });
  });

  it("detects FREESP free-shipping coupons", () => {
    expect(isFreeShippingDiscountCode("FREESP")).toBe(true);
    expect(
      orderHasFreeShippingCoupon([
        { code: "SV20", amount: "2700.00" },
        { code: "FREESP", amount: "400.00" },
      ]),
    ).toBe(true);
  });
});
