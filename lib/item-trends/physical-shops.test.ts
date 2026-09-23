import { describe, expect, it } from "vitest";

import {
  coverLocationOwner,
  coverOutletDisplayName,
  isCosmeticsLkInternalShopColumn,
  isPhysicalShopOsfColumn,
  isShopWarehouseName,
  matchOutletToLocationIds,
  nearestPhysicalShopName,
  osfColumnChannelKind,
  shopDistrictForLocation,
  shopWarehousesForColumn,
} from "@/lib/item-trends/physical-shops";

describe("isShopWarehouseName", () => {
  it("keeps shop floors", () => {
    expect(isShopWarehouseName("GCC Shop Warehouse - Cosmo")).toBe(true);
    expect(isShopWarehouseName("Shop Warehouse - LMJ")).toBe(true);
    expect(isShopWarehouseName("Pepiliyana Shop - SV-1")).toBe(true);
  });

  it("drops main / website / non-shop", () => {
    expect(isShopWarehouseName("Main Warehouse - Cosmo")).toBe(false);
    expect(isShopWarehouseName("Website Inventory - SV-1")).toBe(false);
    expect(isShopWarehouseName("Stores - CCON")).toBe(false);
  });
});

describe("matchOutletToLocationIds", () => {
  const locations = [
    { id: "loc-lmj", name: "LMJ Trading", shortName: "LMJ" },
    { id: "loc-ajs", name: "AJS Trading Lanka Pvt Ltd", shortName: "AJS" },
    { id: "loc-web", name: "Cosmetics.lk", shortName: "cosmetics.lk" },
  ];

  it("matches outlet name to company location", () => {
    expect(matchOutletToLocationIds("LMJ", locations, [])).toContain("loc-lmj");
    expect(matchOutletToLocationIds("LMJ", locations, [])).not.toContain("loc-ajs");
  });

  it("does not treat Cosmetics.lk as a physical shop location", () => {
    expect(matchOutletToLocationIds("SPK", locations, [])).not.toContain("loc-web");
    expect(
      matchOutletToLocationIds("Cosmetics.lk", locations, [
        { key: "web", label: "Cosmetics.lk", companyLocationId: "loc-web" },
      ]),
    ).toEqual([]);
  });
});

describe("isPhysicalShopOsfColumn", () => {
  const shops = [
    { outletId: "1", name: "SPK", district: "Gampaha", locationIds: ["loc-spk"] },
    { outletId: "2", name: "LMJ", district: "Gampaha", locationIds: ["loc-lmj"] },
  ];

  it("keeps Cosmetics.lk POS shop columns", () => {
    expect(
      isCosmeticsLkInternalShopColumn({
        key: "cosmo_shop_gcc",
        label: "GCC Shop",
        companyLocationId: null,
        warehouses: ["GCC Shop Warehouse - Cosmo"],
      }),
    ).toBe(true);
    expect(
      isPhysicalShopOsfColumn(
        {
          key: "cosmo_shop_gcc",
          label: "GCC Shop",
          companyLocationId: null,
          warehouses: ["GCC Shop Warehouse - Cosmo"],
        },
        shops,
      ),
    ).toBe(true);
  });

  it("keeps trading shops that have a Shop Warehouse even without Outlet staff map", () => {
    expect(
      isPhysicalShopOsfColumn(
        {
          key: "lmj",
          label: "LMJ",
          companyLocationId: "loc-lmj",
          companyLocationName: "LMJ",
          warehouses: ["Main Warehouse - LMJ", "Shop Warehouse - LMJ"],
        },
        [],
      ),
    ).toBe(true);
  });

  it("excludes Cosmetics.lk website location column", () => {
    expect(
      isPhysicalShopOsfColumn(
        {
          label: "Cosmetics.lk",
          companyLocationId: "loc-web",
          companyLocationName: "Cosmetics.lk",
          warehouses: ["Main Warehouse - Cosmo"],
        },
        shops,
      ),
    ).toBe(false);
  });

  it("excludes main-only trading warehouses", () => {
    expect(
      isPhysicalShopOsfColumn(
        {
          key: "spk",
          label: "SPK",
          companyLocationId: "loc-spk",
          companyLocationName: "SPK",
          warehouses: ["Main Warehouse - SPK"],
        },
        shops,
      ),
    ).toBe(false);
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

describe("osfColumnChannelKind", () => {
  it("marks cosmetics.lk as online", () => {
    expect(
      osfColumnChannelKind({
        label: "Cosmetics.lk",
        companyLocationId: "loc-web",
        companyLocationName: "cosmetics.lk",
      }),
    ).toBe("online");
  });

  it("marks shop columns as physical", () => {
    expect(
      osfColumnChannelKind({
        label: "Shop Warehouse - MNK",
        companyLocationId: "loc-mnk",
        companyLocationName: "MNK",
      }),
    ).toBe("physical");
  });
});

describe("coverLocationOwner", () => {
  it("labels Cosmo POS shops as Cosmetics.lk", () => {
    expect(
      coverLocationOwner({
        key: "cosmo_shop_gcc",
        label: "GCC Shop",
        companyLocationId: null,
        warehouses: ["GCC Shop Warehouse - Cosmo"],
      }),
    ).toEqual({ group: "cosmetics_lk", ownerLabel: "Cosmetics.lk" });
  });

  it("labels trading columns by OSF company code", () => {
    expect(
      coverLocationOwner({
        key: "chami",
        label: "Chami",
        companyLocationId: "loc-chami",
        companyLocationName: "Cool Planet",
      }),
    ).toEqual({ group: "trading", ownerLabel: "Chami" });

    expect(
      coverLocationOwner({
        key: "mnk",
        label: "MNK",
        companyLocationId: "loc-mnk",
        companyLocationName: "Cool Planet",
      }),
    ).toEqual({ group: "trading", ownerLabel: "MNK" });
  });
});

describe("coverOutletDisplayName", () => {
  const shopName = (label: string) =>
    label.replace(/\s+Shop$/i, "").trim() || label;

  it("uses shop name for Cosmetics.lk columns", () => {
    expect(
      coverOutletDisplayName(
        {
          key: "cosmo_shop_coolplanet",
          label: "Cool Planet Shop",
          companyLocationId: null,
          warehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo"],
        },
        shopName,
      ),
    ).toBe("Cool Planet");
  });

  it("uses company code for trading columns", () => {
    expect(
      coverOutletDisplayName(
        {
          key: "mnk",
          label: "MNK",
          companyLocationId: "loc-mnk",
          companyLocationName: "Cool Planet",
        },
        shopName,
      ),
    ).toBe("MNK");
  });
});
