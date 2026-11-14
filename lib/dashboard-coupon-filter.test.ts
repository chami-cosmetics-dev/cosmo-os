import { describe, expect, it } from "vitest";

import {
  collectDashboardCouponCodes,
  formatDashboardCouponFilterLabel,
  getDashboardDiscountCoupon,
  normalizeDashboardCouponSelection,
  orderMatchesDashboardCoupon,
} from "@/lib/dashboard-coupon-filter";

describe("getDashboardDiscountCoupon", () => {
  it("returns the paying discount code and ignores MER tracking", () => {
    expect(
      getDashboardDiscountCoupon({
        sourceName: "web",
        discountCodes: [
          { code: "MER103-Semini", amount: 0 },
          { code: "NG15", amount: 450 },
        ],
      }),
    ).toBe("NG15");
  });

  it("returns null when only merchant tracking codes exist", () => {
    expect(
      getDashboardDiscountCoupon({
        sourceName: "web",
        discountCodes: [{ code: "MER103", amount: 0 }],
      }),
    ).toBeNull();
  });
});

describe("orderMatchesDashboardCoupon", () => {
  const ng15Order = {
    sourceName: "erpnext-pos",
    discountCodes: [{ code: "NG15" }],
  };

  it("keeps every order when no coupon is selected", () => {
    expect(orderMatchesDashboardCoupon(ng15Order, "")).toBe(true);
    expect(orderMatchesDashboardCoupon(ng15Order, null)).toBe(true);
  });

  it("matches the selected code case-insensitively", () => {
    expect(orderMatchesDashboardCoupon(ng15Order, "ng15")).toBe(true);
    expect(orderMatchesDashboardCoupon(ng15Order, "COS5")).toBe(false);
  });

  it("matches when the order coupon is in a selected list", () => {
    expect(orderMatchesDashboardCoupon(ng15Order, ["COS5", "ng15"])).toBe(true);
    expect(orderMatchesDashboardCoupon(ng15Order, ["COS5", "SV20"])).toBe(false);
    expect(orderMatchesDashboardCoupon(ng15Order, [])).toBe(true);
  });
});

describe("normalizeDashboardCouponSelection", () => {
  it("upper-cases, trims, and drops duplicates", () => {
    expect(normalizeDashboardCouponSelection([" ng15 ", "NG15", "COS5"])).toEqual([
      "NG15",
      "COS5",
    ]);
  });
});

describe("formatDashboardCouponFilterLabel", () => {
  it("summarizes long selections", () => {
    expect(formatDashboardCouponFilterLabel([])).toBe("All coupons");
    expect(formatDashboardCouponFilterLabel(["NG15", "COS5"])).toBe("NG15, COS5");
    expect(formatDashboardCouponFilterLabel(["NG15", "COS5", "COS20"])).toBe("NG15, COS5 +1");
  });
});

describe("collectDashboardCouponCodes", () => {
  it("returns unique discount codes, sorted, without MER codes", () => {
    expect(
      collectDashboardCouponCodes([
        { sourceName: "web", discountCodes: [{ code: "COS5", amount: 100 }] },
        { sourceName: "web", discountCodes: [{ code: "ng15", amount: 200 }] },
        { sourceName: "web", discountCodes: [{ code: "NG15", amount: 50 }] },
        { sourceName: "web", discountCodes: [{ code: "MER101", amount: 0 }] },
      ]),
    ).toEqual(["COS5", "NG15"]);
  });
});
