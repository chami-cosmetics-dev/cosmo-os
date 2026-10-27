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

  it("credits AE DM_General to the assigned shop merchant", () => {
    expect(
      resolveDashboardOrderMerchant({
        orderCoupons: ["dm_general"],
        couponToUser,
        wholesaleOwners,
        assignedMerchantId: "natasha",
        assignedMerchant: { knownName: "Natasha", couponCodes: ["MER99"] },
        userToGroup: new Map(),
        locationName: "AE (PVT) LTD",
      }),
    ).toEqual({ id: "natasha", name: "Natasha", isWholesale: false });
  });

  it("credits AE DM_General to the location default merchant when unassigned", () => {
    expect(
      resolveDashboardOrderMerchant({
        orderCoupons: ["dm_general"],
        couponToUser,
        wholesaleOwners,
        assignedMerchantId: null,
        assignedMerchant: null,
        userToGroup: new Map(),
        locationName: "AE (PVT) LTD",
        locationDefaultMerchant: { id: "natasha", name: "Natasha" },
      }),
    ).toEqual({ id: "natasha", name: "Natasha", isWholesale: false });
  });

  it("credits Origins DM_General to the shop merchant", () => {
    expect(
      resolveDashboardOrderMerchant({
        orderCoupons: ["mer115"],
        couponToUser,
        wholesaleOwners,
        assignedMerchantId: null,
        assignedMerchant: null,
        userToGroup: new Map(),
        locationName: "Origins (PVT) LTD",
        locationDefaultMerchant: { id: "natasha", name: "Natasha" },
      }),
    ).toEqual({ id: "natasha", name: "Natasha", isWholesale: false });
  });

  it("keeps SupplementVault DM_General as DM-General", () => {
    expect(
      resolveDashboardOrderMerchant({
        orderCoupons: ["dm_general"],
        couponToUser,
        wholesaleOwners,
        assignedMerchantId: "natasha",
        assignedMerchant: { knownName: "Natasha", couponCodes: ["MER99"] },
        userToGroup: new Map(),
        locationName: "SupplementVault.lk",
        locationDefaultMerchant: { id: "natasha", name: "Natasha" },
      }),
    ).toEqual({ id: null, name: "DM-General", isWholesale: false });
  });
});
