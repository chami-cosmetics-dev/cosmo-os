import { describe, expect, it } from "vitest";

import {
  buildWholesaleCouponSet,
  collectMerchantWholesaleCodes,
  isWholesaleTrackingCode,
  normalizeWholesaleMerCodeKey,
  orderIsWholesale,
  splitStaffMerCodes,
  trackingCodesMatch,
  wholesaleDashboardMerchantName,
  wholesaleMerchantMatchesOrder,
} from "@/lib/merchant-wholesale";

describe("merchant-wholesale", () => {
  it("normalizes WH codes", () => {
    expect(normalizeWholesaleMerCodeKey("WH56")).toBe("WH56");
    expect(normalizeWholesaleMerCodeKey("wh 99")).toBe("WH99");
    expect(normalizeWholesaleMerCodeKey("WH-1")).toBe("WH1");
    expect(normalizeWholesaleMerCodeKey("wh-1-name")).toBe("WH1");
    expect(normalizeWholesaleMerCodeKey("MER56")).toBeNull();
  });

  it("pulls WH codes out of the personal MER list", () => {
    expect(
      splitStaffMerCodes({
        couponCodes: ["MER102-Maheshi Soysa", "MER102", "WH-1"],
        wholesaleCouponCodes: ["WH56"],
      }),
    ).toEqual({
      couponCodes: ["MER102-Maheshi Soysa", "MER102"],
      wholesaleCouponCodes: ["WH56", "WH-1"],
    });
    expect(trackingCodesMatch("WH-1", "wh1")).toBe(true);
    expect(
      collectMerchantWholesaleCodes({
        couponCodes: ["MER102", "WH-1"],
        wholesaleCouponCodes: [],
      }),
    ).toEqual(["WH-1"]);
    expect(wholesaleDashboardMerchantName("Maheshi")).toBe("Maheshi · Wholesale");
  });

  it("detects wholesale orders and merchant match", () => {
    const set = buildWholesaleCouponSet(["WH56", "WH99-Dinuli"]);
    expect(orderIsWholesale(["wh56", "sv20"])).toBe(true);
    expect(isWholesaleTrackingCode("WH56")).toBe(true);
    expect(wholesaleMerchantMatchesOrder(["wh56"], set)).toBe(true);
    expect(wholesaleMerchantMatchesOrder(["wh57"], set)).toBe(false);
  });
});
