import { describe, expect, it } from "vitest";

import {
  matchOutletToLocationIds,
  nearestPhysicalShopName,
  shopDistrictForLocation,
} from "@/lib/item-trends/physical-shops";

describe("matchOutletToLocationIds", () => {
  const locations = [
    { id: "loc-lmj", name: "LMJ Trading", shortName: "LMJ" },
    { id: "loc-ajs", name: "AJS Trading Lanka Pvt Ltd", shortName: "AJS" },
  ];

  it("matches outlet name to company location", () => {
    expect(matchOutletToLocationIds("LMJ", locations, [])).toContain("loc-lmj");
    expect(matchOutletToLocationIds("LMJ", locations, [])).not.toContain("loc-ajs");
  });
});

describe("nearestPhysicalShopName", () => {
  it("returns shop in same district only", () => {
    const shops = [
      { outletId: "1", name: "Nugegoda", district: "Colombo", locationIds: [] },
      { outletId: "2", name: "LMJ", district: "Gampaha", locationIds: [] },
    ];
    expect(nearestPhysicalShopName("Gampaha", shops)).toBe("LMJ");
    expect(nearestPhysicalShopName("Kandy", shops)).toBeNull();
  });
});

describe("shopDistrictForLocation", () => {
  it("uses physical shop district, not warehouse locations", () => {
    const shops = [
      { outletId: "1", name: "LMJ", district: "Gampaha", locationIds: ["loc-lmj"] },
    ];
    const fallback = new Map([["loc-ajs", "Colombo"]]);
    expect(shopDistrictForLocation("loc-lmj", shops, fallback)).toBe("Gampaha");
    expect(shopDistrictForLocation("loc-ajs", shops, fallback)).toBeNull();
  });
});
