import { describe, expect, it } from "vitest";

import {
  buildWholesaleOwnerMap,
  resolveDashboardOrderMerchant,
} from "@/lib/dashboard-order-merchant";
import { buildCouponToMerchantMap } from "@/lib/merchant-groups";

describe("resolveDashboardOrderMerchant", () => {
  const users = [
    {
      id: "maheshi",
      knownName: "Maheshi",
      couponCodes: ["MER102", "WH-1"],
      wholesaleCouponCodes: [] as string[],
    },
  ];
  const couponToUser = buildCouponToMerchantMap(users);
  const wholesaleOwners = buildWholesaleOwnerMap(users);

  it("keeps personal MER on the merchant", () => {
    expect(
      resolveDashboardOrderMerchant({
        orderCoupons: ["mer102"],
        couponToUser,
        wholesaleOwners,
        assignedMerchantId: null,
        assignedMerchant: null,
        userToGroup: new Map(),
      }),
    ).toEqual({ id: "maheshi", name: "Maheshi", isWholesale: false });
  });

  it("puts WH orders on a separate wholesale row", () => {
    expect(
      resolveDashboardOrderMerchant({
        orderCoupons: ["wh-1"],
        couponToUser,
        wholesaleOwners,
        assignedMerchantId: "maheshi",
        assignedMerchant: { knownName: "Maheshi", couponCodes: ["MER102", "WH-1"] },
        userToGroup: new Map(),
      }),
    ).toEqual({
      id: "maheshi",
      name: "Maheshi · Wholesale",
      isWholesale: true,
    });
  });

  it("keeps AE DM_General as DM-General even if someone is assigned", () => {
    expect(
      resolveDashboardOrderMerchant({
        orderCoupons: ["dm_general"],
        couponToUser,
        wholesaleOwners,
        assignedMerchantId: "himaya",
        assignedMerchant: { knownName: "himaya", couponCodes: [] },
        userToGroup: new Map(),
        locationName: "AE (PVT) LTD",
      }),
    ).toEqual({ id: null, name: "DM-General", isWholesale: false });
  });

  it("puts orders with no MER on DM-General even if a cashier is assigned", () => {
    expect(
      resolveDashboardOrderMerchant({
        orderCoupons: [],
        couponToUser,
        wholesaleOwners,
        assignedMerchantId: "himaya",
        assignedMerchant: { knownName: "himaya", couponCodes: [] },
        userToGroup: new Map(),
        locationName: "AE (PVT) LTD",
      }),
    ).toEqual({ id: null, name: "DM-General", isWholesale: false });
  });

  it("assigns AE personal MER to that merchant", () => {
    const natashaUsers = [
      {
        id: "natasha",
        knownName: "Natasha",
        couponCodes: ["MER99", "MER99-Dinuli"],
        wholesaleCouponCodes: [] as string[],
      },
    ];
    expect(
      resolveDashboardOrderMerchant({
        orderCoupons: ["mer99-dinuli"],
        couponToUser: buildCouponToMerchantMap(natashaUsers),
        wholesaleOwners: buildWholesaleOwnerMap(natashaUsers),
        assignedMerchantId: "himaya",
        assignedMerchant: { knownName: "himaya", couponCodes: [] },
        userToGroup: new Map(),
        locationName: "AE (PVT) LTD",
      }),
    ).toEqual({ id: "natasha", name: "Natasha", isWholesale: false });
  });
});
