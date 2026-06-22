import { describe, expect, it } from "vitest";

import {
  buildErpOrderDiscountCodes,
  getErpDiscountCouponFromPayload,
  getOrderDiscountCouponCode,
} from "@/lib/order-discount-coupon";

describe("getErpDiscountCouponFromPayload", () => {
  it("reads coupon_code from nested webhook payload", () => {
    expect(
      getErpDiscountCouponFromPayload({
        data: { coupon_code: "SV20", custom_merchant_coupon_code: "MER99-Dinuli" },
      }),
    ).toBe("SV20");
  });

  it("falls back to custom_coupon_code", () => {
    expect(
      getErpDiscountCouponFromPayload({ custom_coupon_code: "June15" }),
    ).toBe("June15");
  });
});

describe("getOrderDiscountCouponCode", () => {
  it("returns Shopify discount code from discountCodes", () => {
    expect(
      getOrderDiscountCouponCode({
        sourceName: "web",
        discountCodes: [
          { code: "MER99-Dinuli", amount: 0 },
          { code: "SV20", amount: 1500 },
        ],
        rawPayload: null,
      }),
    ).toBe("SV20");
  });

  it("returns ERP coupon from rawPayload when not in discountCodes", () => {
    expect(
      getOrderDiscountCouponCode({
        sourceName: "erpnext",
        discountCodes: [{ code: "MER99-Dinuli", amount: 0 }],
        rawPayload: { data: { custom_coupon_code: "SV20" } },
      }),
    ).toBe("SV20");
  });
});

describe("buildErpOrderDiscountCodes", () => {
  it("stores discount and merchant codes separately", () => {
    expect(
      buildErpOrderDiscountCodes({
        custom_coupon_code: "SV20",
        custom_merchant_coupon_code: "MER99-Dinuli",
      }),
    ).toEqual([
      { code: "SV20" },
      { code: "MER99-Dinuli", amount: 0 },
    ]);
  });
});
