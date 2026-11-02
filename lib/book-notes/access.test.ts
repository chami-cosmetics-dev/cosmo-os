import { describe, expect, it } from "vitest";

import {
  assertBookNoteShopAllowed,
  collectAssignedBookNoteLocationIds,
} from "@/lib/book-notes/access";

describe("collectAssignedBookNoteLocationIds", () => {
  it("includes employee location when profile company matches", () => {
    expect(
      collectAssignedBookNoteLocationIds({
        companyId: "co1",
        profileLocationId: "loc_spk",
        profileCompanyId: "co1",
        defaultMerchantLocationIds: [],
      }),
    ).toEqual(["loc_spk"]);
  });

  it("ignores employee location from another company", () => {
    expect(
      collectAssignedBookNoteLocationIds({
        companyId: "co1",
        profileLocationId: "loc_spk",
        profileCompanyId: "co2",
        defaultMerchantLocationIds: [],
      }),
    ).toEqual([]);
  });

  it("unions default-merchant shops with employee location", () => {
    expect(
      collectAssignedBookNoteLocationIds({
        companyId: "co1",
        profileLocationId: "loc_spk",
        profileCompanyId: "co1",
        defaultMerchantLocationIds: ["loc_lmj", "loc_spk", ""],
      }).sort(),
    ).toEqual(["loc_lmj", "loc_spk"]);
  });

  it("returns empty when nothing is assigned", () => {
    expect(
      collectAssignedBookNoteLocationIds({
        companyId: "co1",
        profileLocationId: null,
        profileCompanyId: "co1",
        defaultMerchantLocationIds: [],
      }),
    ).toEqual([]);
  });
});

describe("assertBookNoteShopAllowed", () => {
  const access = {
    canAccessAllShops: false,
    locations: [
      {
        id: "loc_spk",
        name: "Speakeasy",
        shortName: "SPK",
        erpnextCompany: "SPK",
      },
    ],
  };

  it("allows an assigned shop", () => {
    expect(assertBookNoteShopAllowed(access, "loc_spk")).toBe(true);
  });

  it("blocks a shop the merchant is not posted to", () => {
    expect(assertBookNoteShopAllowed(access, "loc_kandy")).toBe(false);
  });
});
