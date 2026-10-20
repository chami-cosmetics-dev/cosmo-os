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
});
