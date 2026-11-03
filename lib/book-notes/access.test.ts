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
        mappedLocationIds: [],
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
        mappedLocationIds: [],
      }),
    ).toEqual([]);
  });

  it("unions default-merchant, profile, and outlet-mapped shops", () => {
    expect(
      collectAssignedBookNoteLocationIds({
        companyId: "co1",
        profileLocationId: "loc_spk",
        profileCompanyId: "co1",
        defaultMerchantLocationIds: ["loc_lmj", ""],
        mappedLocationIds: ["loc_mnk", "loc_cosmo", "loc_spk"],
      }).sort(),
    ).toEqual(["loc_cosmo", "loc_lmj", "loc_mnk", "loc_spk"]);
  });
});

describe("assertBookNoteShopAllowed", () => {
  const access = {
    canAccessAllShops: false,
    cosmeticsPosScope: null,
    locations: [
      {
        id: "loc_mnk",
        name: "MNK Trading Lanka Pvt Ltd",
        shortName: "MNK",
        erpnextCompany: "MNK Trading Lanka (Pvt) Ltd",
      },
    ],
  };

  it("allows an assigned shop", () => {
    expect(assertBookNoteShopAllowed(access, "loc_mnk")).toBe(true);
  });

  it("blocks a shop the merchant is not posted to", () => {
    expect(assertBookNoteShopAllowed(access, "loc_dro")).toBe(false);
  });
});
