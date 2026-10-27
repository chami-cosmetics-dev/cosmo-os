import { describe, expect, it } from "vitest";

import {
  classifyMerchantSalesBucket,
  dmBucketShareForHolder,
  isDmCouponCode,
  isDmOnlyMerchantTracking,
  isStaffSalesCouponCode,
  parseOrderCouponList,
  resolveCohortMerchantId,
  resolveDmHolderMerchantIds,
  resolveFixedSalesCouponBucket,
  shopLocationCreditsDmCouponToMerchant,
  splitMerchantCouponSets,
  STAFF_SALES_DISPLAY_NAME,
} from "@/lib/merchant-dm-sales";

describe("resolveFixedSalesCouponBucket", () => {
  it("maps staff discount coupons to Staff Sales", () => {
    expect(isStaffSalesCouponCode("STAFFDC")).toBe(true);
    expect(isStaffSalesCouponCode("dir100")).toBe(true);
    expect(isStaffSalesCouponCode("staff-vat")).toBe(true);
    expect(isStaffSalesCouponCode("staff-sale")).toBe(true);
    expect(isStaffSalesCouponCode("mer91")).toBe(false);
    expect(resolveFixedSalesCouponBucket(["mer91", "staffdc"])).toEqual({
      id: null,
      name: STAFF_SALES_DISPLAY_NAME,
    });
    expect(resolveFixedSalesCouponBucket(["DIR100"])).toEqual({
      id: null,
      name: STAFF_SALES_DISPLAY_NAME,
    });
    expect(resolveFixedSalesCouponBucket(["staffvat"])).toEqual({
      id: null,
      name: STAFF_SALES_DISPLAY_NAME,
    });
    expect(resolveFixedSalesCouponBucket(["mer91", "sv20"])).toBeNull();
  });
});

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

describe("shopLocationCreditsDmCouponToMerchant", () => {
  it("is true for AE and Origins shop names", () => {
    expect(shopLocationCreditsDmCouponToMerchant("AE (PVT) LTD")).toBe(true);
    expect(shopLocationCreditsDmCouponToMerchant("Origins (PVT) LTD")).toBe(
      true,
    );
    expect(shopLocationCreditsDmCouponToMerchant("ae (pvt) ltd")).toBe(true);
  });

  it("is false for SupplementVault and blank", () => {
    expect(shopLocationCreditsDmCouponToMerchant("SupplementVault.lk")).toBe(
      false,
    );
    expect(shopLocationCreditsDmCouponToMerchant(null)).toBe(false);
    expect(shopLocationCreditsDmCouponToMerchant("")).toBe(false);
  });
});

describe("isDmOnlyMerchantTracking", () => {
  it("is true for ERP DM_General / MER115 with no personal MER", () => {
    expect(isDmOnlyMerchantTracking(["DM_General"])).toBe(true);
    expect(isDmOnlyMerchantTracking(["mer115"])).toBe(true);
    expect(isDmOnlyMerchantTracking(["dm_general", "welcome10"])).toBe(true);
  });

  it("is false when a personal MER is present or tracking is empty", () => {
    expect(isDmOnlyMerchantTracking(["mer109-nimthera", "dm_general"])).toBe(
      false,
    );
    expect(isDmOnlyMerchantTracking(["mer109"])).toBe(false);
    expect(isDmOnlyMerchantTracking([])).toBe(false);
    expect(isDmOnlyMerchantTracking(null)).toBe(false);
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

  it("treats AE DM_General as mer for the shop merchant", () => {
    const personalOnly = splitMerchantCouponSets(["MER99"]);
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: ["dm_general"],
        ...personalOnly,
        assignedToViewer: true,
        locationName: "AE (PVT) LTD",
      }),
    ).toBe("mer");
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: ["dm_general"],
        ...personalOnly,
        assignedToViewer: false,
        locationName: "AE (PVT) LTD",
        locationDefaultIsViewer: true,
      }),
    ).toBe("mer");
    expect(
      classifyMerchantSalesBucket({
        orderCoupons: ["dm_general"],
        ...personalOnly,
        assignedToViewer: false,
        locationName: "SupplementVault.lk",
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

  it("does not credit assigned merchant for DM_General when cohort has no DM holder", () => {
    const couponToMerchantId = new Map([["mer109", "u-nimthera"]]);
    expect(
      resolveCohortMerchantId({
        orderCoupons: ["dm_general"],
        couponToMerchantId,
        assignedMerchantId: "u-nimthera",
        cohortIds: new Set(["u-nimthera"]),
        dmBucketId: null,
      }),
    ).toBeNull();
  });

  it("credits AE DM_General to assigned shop merchant instead of DM bucket", () => {
    const couponToMerchantId = new Map([
      ["mer99", "u-natasha"],
      ["mer115", "__dm_general__"],
    ]);
    expect(
      resolveCohortMerchantId({
        orderCoupons: ["dm_general"],
        couponToMerchantId,
        assignedMerchantId: "u-natasha",
        cohortIds: new Set(["u-natasha"]),
        dmBucketId: "__dm_general__",
        locationName: "AE (PVT) LTD",
      }),
    ).toBe("u-natasha");
    expect(
      resolveCohortMerchantId({
        orderCoupons: ["dm_general"],
        couponToMerchantId,
        assignedMerchantId: null,
        cohortIds: new Set(["u-natasha"]),
        dmBucketId: "__dm_general__",
        locationName: "AE (PVT) LTD",
        locationDefaultMerchantId: "u-natasha",
      }),
    ).toBe("u-natasha");
    expect(
      resolveCohortMerchantId({
        orderCoupons: ["dm_general"],
        couponToMerchantId,
        assignedMerchantId: "u-natasha",
        cohortIds: new Set(["u-natasha"]),
        dmBucketId: "__dm_general__",
        locationName: "SupplementVault.lk",
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

describe("resolveDmHolderMerchantIds", () => {
  it("returns merchants with DM coupon codes", () => {
    const merchants = [{ id: "u-sandali" }, { id: "u-other" }];
    const couponById = new Map<string, string[]>([
      ["u-sandali", ["MER91-Sandali", "MER115-Sandali"]],
      ["u-other", ["MER50-Other"]],
    ]);
    expect(resolveDmHolderMerchantIds(merchants, couponById)).toEqual([
      "u-sandali",
    ]);
  });
});

describe("dmBucketShareForHolder", () => {
  it("gives full share to sole holder and splits evenly when multiple", () => {
    expect(dmBucketShareForHolder("a", ["a"])).toBe(1);
    expect(dmBucketShareForHolder("a", ["a", "b"])).toBe(0.5);
    expect(dmBucketShareForHolder("c", ["a", "b"])).toBe(0);
  });
});
