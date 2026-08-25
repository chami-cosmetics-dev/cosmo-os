import { describe, expect, it } from "vitest";

import {
  classifyMerchantSalesBucket,
  isDmCouponCode,
  parseOrderCouponList,
  resolveCohortMerchantId,
  splitMerchantCouponSets,
} from "@/lib/merchant-dm-sales";

describe("isDmCouponCode", () => {
  it("matches MER115 and DM-General labels", () => {
    expect(isDmCouponCode("MER115")).toBe(true);
    expect(isDmCouponCode("MER115-Sandali")).toBe(true);
    expect(isDmCouponCode("DM - General")).toBe(true);
    expect(isDmCouponCode("DM-General")).toBe(true);
    expect(isDmCouponCode("DM_General")).toBe(true);
    expect(isDmCouponCode("MER91")).toBe(false);
    expect(isDmCouponCode("MER91-Sandali")).toBe(false);
  });
});

describe("splitMerchantCouponSets", () => {
  it("splits personal MER from DM codes", () => {
    const sets = splitMerchantCouponSets([
      "MER91-Sandali",
      "MER91",
      "MER115",
      "MER115-CM001",
    ]);
    expect(sets.hasDm).toBe(true);
    expect(sets.personal.has("mer91")).toBe(true);
    expect(sets.dm.has("mer115")).toBe(true);
    expect(sets.personal.has("mer115")).toBe(false);
  });
});

describe("classifyMerchantSalesBucket", () => {
  const sets = splitMerchantCouponSets(["MER91", "MER115"]);

  it("puts personal MER orders in mer", () => {
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: ["mer91-sandali", "mer91"],
        ...sets,
        assignedToViewer: false,
      }),
    ).toBe("mer");
  });

  it("puts DM MER orders in dm", () => {
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: ["mer115"],
        ...sets,
        assignedToViewer: false,
      }),
    ).toBe("dm");
  });

  it("puts orders with no MER code in dm when user owns DM", () => {
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: parseOrderCouponList("LOYALCS"),
        ...sets,
        assignedToViewer: false,
      }),
    ).toBe("dm");
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: [],
        ...sets,
        assignedToViewer: true,
      }),
    ).toBe("dm");
  });

  it("puts ERP DM_General on order into dm even when not on user couponCodes", () => {
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: ["dm_general"],
        ...sets,
        assignedToViewer: false,
      }),
    ).toBe("dm");
  });

  it("ignores other merchants MER codes", () => {
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: ["mer56"],
        ...sets,
        assignedToViewer: false,
      }),
    ).toBeNull();
  });

  it("uses assignment only when user has no DM bucket", () => {
    const personalOnly = splitMerchantCouponSets(["MER91"]);
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: [],
        ...personalOnly,
        assignedToViewer: true,
      }),
    ).toBe("mer");
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: [],
        ...personalOnly,
        assignedToViewer: false,
      }),
    ).toBeNull();
  });
});

describe("resolveCohortMerchantId", () => {
  it("routes no-MER orders to the DM bucket", () => {
    const couponToMerchantId = new Map([
      ["mer91", "u-sandali"],
      ["mer115", "__dm_general__"],
    ]);
    expect(
      resolveCohortMerchantId({
        orderCoupons: [],
        couponToMerchantId,
        assignedMerchantId: null,
        cohortIds: new Set(["u-sandali", "u-other"]),
        dmBucketId: "__dm_general__",
      }),
    ).toBe("__dm_general__");
  });

  it("routes DM MER codes to the DM bucket", () => {
    const couponToMerchantId = new Map([
      ["mer91", "u-sandali"],
      ["mer115", "__dm_general__"],
    ]);
    expect(
      resolveCohortMerchantId({
        orderCoupons: ["mer115"],
        couponToMerchantId,
        assignedMerchantId: null,
        cohortIds: new Set(["u-sandali"]),
        dmBucketId: "__dm_general__",
      }),
    ).toBe("__dm_general__");
  });

  it("routes ERP DM_General to the DM bucket when not in coupon map", () => {
    const couponToMerchantId = new Map([["mer91", "u-sandali"]]);
    expect(
      resolveCohortMerchantId({
        orderCoupons: ["dm_general"],
        couponToMerchantId,
        assignedMerchantId: "u-sandali",
        cohortIds: new Set(["u-sandali"]),
        dmBucketId: "__dm_general__",
      }),
    ).toBe("__dm_general__");
  });

  it("keeps personal MER on the merchant user", () => {
    const couponToMerchantId = new Map([
      ["mer91", "u-sandali"],
      ["mer115", "__dm_general__"],
    ]);
    expect(
      resolveCohortMerchantId({
        orderCoupons: ["mer91"],
        couponToMerchantId,
        assignedMerchantId: null,
        cohortIds: new Set(["u-sandali"]),
        dmBucketId: "__dm_general__",
      }),
    ).toBe("u-sandali");
  });
});
