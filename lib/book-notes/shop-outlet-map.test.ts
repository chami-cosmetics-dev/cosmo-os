import { describe, expect, it } from "vitest";

import {
  collectBookNoteCosmeticsPosScope,
  collectBookNoteTradingShortNames,
  isCosmeticsBookNoteLocation,
  orderMatchesCosmeticsPosScope,
} from "@/lib/book-notes/shop-outlet-map";

describe("isCosmeticsBookNoteLocation", () => {
  it("matches Cosmetics.lk company / name", () => {
    expect(
      isCosmeticsBookNoteLocation({ erpnextCompany: "Cosmetics.lk" }),
    ).toBe(true);
    expect(isCosmeticsBookNoteLocation({ name: "Cosmetics.lk" })).toBe(true);
    expect(isCosmeticsBookNoteLocation({ shortName: "MNK" })).toBe(false);
  });
});

describe("collectBookNoteTradingShortNames", () => {
  it("maps CoolPlanet outlet to MNK", () => {
    expect(
      collectBookNoteTradingShortNames({ outletName: "CoolPlanet" }),
    ).toEqual(["MNK"]);
  });

  it("keeps profile shortName even without outlet", () => {
    expect(
      collectBookNoteTradingShortNames({
        outletName: null,
        locationShortNames: ["SPK"],
      }),
    ).toEqual(["SPK"]);
  });
});

describe("collectBookNoteCosmeticsPosScope", () => {
  it("scopes Cool Planet to Nugegoda POS", () => {
    expect(
      collectBookNoteCosmeticsPosScope({ outletName: "CoolPlanet" }),
    ).toEqual({
      posProfiles: ["Cool Planet Nugegoda Shop"],
      warehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo"],
    });
  });

  it("returns null for SPK (no Cosmetics POS)", () => {
    expect(
      collectBookNoteCosmeticsPosScope({
        locationShortNames: ["SPK"],
      }),
    ).toBeNull();
  });

  it("maps MNK location shortName to Cool Planet POS", () => {
    expect(
      collectBookNoteCosmeticsPosScope({
        locationShortNames: ["MNK"],
      }),
    ).toEqual({
      posProfiles: ["Cool Planet Nugegoda Shop"],
      warehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo"],
    });
  });
});

describe("orderMatchesCosmeticsPosScope", () => {
  const scope = {
    posProfiles: ["Cool Planet Nugegoda Shop"],
    warehouses: ["Cool Planet Nugegoda Shop Warehouse - Cosmo"],
  };

  it("matches pos profile or warehouse", () => {
    expect(
      orderMatchesCosmeticsPosScope({
        posProfile: "Cool Planet Nugegoda Shop",
        erpnextWarehouse: null,
        scope,
      }),
    ).toBe(true);
    expect(
      orderMatchesCosmeticsPosScope({
        posProfile: null,
        erpnextWarehouse: "Cool Planet Nugegoda Shop Warehouse - Cosmo",
        scope,
      }),
    ).toBe(true);
    expect(
      orderMatchesCosmeticsPosScope({
        posProfile: "Maharagama Shop",
        erpnextWarehouse: "Maharagama Shop Warehouse - Cosmo",
        scope,
      }),
    ).toBe(false);
  });
});
