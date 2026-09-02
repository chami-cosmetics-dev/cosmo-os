import { describe, expect, it } from "vitest";

import {
  buildWholesaleCouponSet,
  isWholesaleTrackingCode,
  normalizeWholesaleMerCodeKey,
  orderIsWholesale,
  wholesaleMerchantMatchesOrder,
} from "@/lib/merchant-wholesale";

describe("merchant-wholesale", () => {
  it("normalizes WH codes", () => {
    expect(normalizeWholesaleMerCodeKey("WH56")).toBe("WH56");
    expect(normalizeWholesaleMerCodeKey("wh 99")).toBe("WH99");
    expect(normalizeWholesaleMerCodeKey("MER56")).toBeNull();
  });

  it("detects wholesale orders and merchant match", () => {
    const set = buildWholesaleCouponSet(["WH56", "WH99-Dinuli"]);
    expect(orderIsWholesale(["wh56", "sv20"])).toBe(true);
    expect(isWholesaleTrackingCode("WH56")).toBe(true);
    expect(wholesaleMerchantMatchesOrder(["wh56"], set)).toBe(true);
    expect(wholesaleMerchantMatchesOrder(["wh57"], set)).toBe(false);
  });
});
