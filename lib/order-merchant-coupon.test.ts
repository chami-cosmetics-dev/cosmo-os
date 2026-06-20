import { describe, expect, it } from "vitest";

import { getMerchantCouponCode, resolveOrderMerchantLabel } from "@/lib/order-merchant-coupon";

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

  it("resolveOrderMerchantLabel prefers assigned merchant over coupon code", () => {
    expect(
      resolveOrderMerchantLabel({
        assignedMerchant: { name: "Dinuli", email: "dinuli@example.com" },
        sourceName: "web",
        discountCodes: [{ code: "MER99", amount: "0.00" }],
      }),
    ).toBe("Dinuli");
  });

  it("resolveOrderMerchantLabel falls back to MER coupon when unassigned", () => {
    expect(
      resolveOrderMerchantLabel({
        assignedMerchant: null,
        sourceName: "web",
        discountCodes: [
          { code: "SV20", amount: "3980.00" },
          { code: "MER99", amount: "0.00" },
        ],
      }),
    ).toBe("MER99");
  });
});
