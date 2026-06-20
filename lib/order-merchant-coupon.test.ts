import { describe, expect, it } from "vitest";

import { getMerchantCouponCode } from "@/lib/order-merchant-coupon";

describe("order-merchant-coupon", () => {
  it("returns only MER / tracking codes for Shopify web orders", () => {
    expect(
      getMerchantCouponCode({
        sourceName: "web",
        discountCodes: [
          { code: "SV20", amount: "3700.00" },
          { code: "MER99", amount: "0.00" },
        ],
        rawPayload: null,
      }),
    ).toBe("MER99");
  });

  it("returns null when only a discount code is present", () => {
    expect(
      getMerchantCouponCode({
        sourceName: "web",
        discountCodes: [{ code: "SV20", amount: "7800.00" }],
        rawPayload: null,
      }),
    ).toBeNull();
  });
});
