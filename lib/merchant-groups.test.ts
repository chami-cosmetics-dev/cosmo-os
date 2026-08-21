import { describe, expect, it } from "vitest";

import { normalizeDashboardMerchantLabel } from "@/lib/merchant-dm-sales";
import {
  buildCouponToMerchantMap,
  matchMerchantFromCouponMap,
  resolveAssignedMerchantDashboardFallback,
} from "@/lib/merchant-groups";

describe("normalizeDashboardMerchantLabel", () => {
  it("maps Unknown / blank / DM General to DM-General", () => {
    expect(normalizeDashboardMerchantLabel("Unknown")).toBe("DM-General");
    expect(normalizeDashboardMerchantLabel("unknown")).toBe("DM-General");
    expect(normalizeDashboardMerchantLabel("")).toBe("DM-General");
    expect(normalizeDashboardMerchantLabel(null)).toBe("DM-General");
    expect(normalizeDashboardMerchantLabel("DM General")).toBe("DM-General");
    expect(normalizeDashboardMerchantLabel("Unassigned")).toBe("DM-General");
  });

  it("keeps real merchant names", () => {
    expect(normalizeDashboardMerchantLabel("sandali")).toBe("sandali");
  });
});

describe("buildCouponToMerchantMap DM split", () => {
  it("maps personal MER to merchant and DM codes to DM-General", () => {
    const map = buildCouponToMerchantMap([
      {
        id: "sandali",
        knownName: "sandali",
        name: "Sadali Navodya",
        email: "s@example.com",
        couponCodes: ["MER91-Sandali", "MER91", "MER115", "MER115-DMG"],
      },
    ]);

    expect(map.get("mer91")?.id).toBe("sandali");
    expect(map.get("mer91-sandali")?.id).toBe("sandali");
    expect(map.get("mer115")?.name).toBe("DM-General");
    expect(map.get("mer115")?.id).toBeNull();
    expect(map.get("mer115-dmg")?.name).toBe("DM-General");
  });
});

describe("matchMerchantFromCouponMap", () => {
  it("prefers personal MER over DM when both present", () => {
    const map = buildCouponToMerchantMap([
      {
        id: "sandali",
        knownName: "sandali",
        couponCodes: ["MER91", "MER115"],
      },
    ]);
    const hit = matchMerchantFromCouponMap(["mer115", "mer91"], map);
    expect(hit?.id).toBe("sandali");
  });

  it("returns DM-General for DM-only coupons", () => {
    const map = buildCouponToMerchantMap([
      {
        id: "sandali",
        knownName: "sandali",
        couponCodes: ["MER91", "MER115"],
      },
    ]);
    expect(matchMerchantFromCouponMap(["mer115"], map)?.name).toBe("DM-General");
  });
});

describe("resolveAssignedMerchantDashboardFallback", () => {
  it("sends DM-holder assignee without personal MER to DM-General", () => {
    const hit = resolveAssignedMerchantDashboardFallback({
      assignedMerchantId: "sandali",
      assignedMerchant: {
        knownName: "sandali",
        couponCodes: ["MER91", "MER115"],
      },
      orderCoupons: [],
      userToGroup: new Map(),
    });
    expect(hit).toEqual({ id: null, name: "DM-General" });
  });

  it("keeps personal MER assignee when order carries their MER", () => {
    const hit = resolveAssignedMerchantDashboardFallback({
      assignedMerchantId: "sandali",
      assignedMerchant: {
        knownName: "sandali",
        couponCodes: ["MER91", "MER115"],
      },
      orderCoupons: ["mer91"],
      userToGroup: new Map(),
    });
    expect(hit.id).toBe("sandali");
    expect(hit.name).toBe("sandali");
  });
});
