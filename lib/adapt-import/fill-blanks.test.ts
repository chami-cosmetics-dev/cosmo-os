import { describe, expect, it } from "vitest";

import { buildContactFillBlanksPatch } from "@/lib/adapt-import/fill-blanks";
import { pickBetterContact } from "@/lib/adapt-import/contact-resolve";
import {
  loadAdaptLocationMapFromJson,
  resolveAdaptCompanyLocationId,
} from "@/lib/adapt-import/location-map";

describe("buildContactFillBlanksPatch", () => {
  it("never overwrites non-blank Cosmo fields", () => {
    const patch = buildContactFillBlanksPatch(
      {
        name: "Existing",
        email: "old@ex.com",
        phoneNumber: "0711111111",
        address: "Old addr",
        district: "Colombo",
        zone: "A",
        town: null,
        remarks: null,
        source: "shopify",
      },
      {
        name: "Adapt Name",
        email: "new@ex.com",
        phone: "0722222222",
        address: "New addr",
        district: "Galle",
        zone: "B",
        nearestOutlet: "Near X",
        remarks: "note",
      }
    );
    expect(patch.name).toBeUndefined();
    expect(patch.email).toBeUndefined();
    expect(patch.phoneNumber).toBeUndefined();
    expect(patch.address).toBeUndefined();
    expect(patch.district).toBeUndefined();
    expect(patch.zone).toBeUndefined();
    expect(patch.town).toBe("Near X");
    expect(patch.remarks).toBe("note");
    expect(patch.source).toBeUndefined();
  });
});

describe("resolveAdaptCompanyLocationId", () => {
  const locations = [
    {
      id: "cl1",
      name: "Pepiliyana",
      shortName: "PEP",
      locationReference: "1",
    },
  ];

  it("uses map salesLocationId when valid", () => {
    const map = loadAdaptLocationMapFromJson(
      JSON.stringify([
        {
          salesLocationId: "1",
          locationName: "Head Office- Pepiliyana",
          companyLocationId: "cl1",
        },
      ])
    );
    expect(
      resolveAdaptCompanyLocationId({
        salesLocationId: "1",
        locationName: "Head Office- Pepiliyana",
        map,
        locations,
      })
    ).toBe("cl1");
  });

  it("falls back to locationReference match", () => {
    expect(
      resolveAdaptCompanyLocationId({
        salesLocationId: null,
        locationName: "1",
        map: [],
        locations,
      })
    ).toBe("cl1");
  });

  it("returns null when unmapped", () => {
    expect(
      resolveAdaptCompanyLocationId({
        salesLocationId: "99",
        locationName: "Unknown Outlet",
        map: [],
        locations,
      })
    ).toBeNull();
  });
});

describe("pickBetterContact", () => {
  it("prefers newer lastPurchaseAt", () => {
    const a = {
      id: "a",
      lastPurchaseAt: new Date("2020-01-01"),
      updatedAt: new Date("2024-01-01"),
    };
    const b = {
      id: "b",
      lastPurchaseAt: new Date("2023-01-01"),
      updatedAt: new Date("2021-01-01"),
    };
    expect(pickBetterContact(a, b).id).toBe("b");
  });
});
