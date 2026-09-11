import { describe, expect, it } from "vitest";

import { canViewBookNoteDay } from "@/lib/book-notes/access";

const MER1 = "user_mer1";
const MER2 = "user_mer2";
const SHOP = "loc_cosmetics";

function sheetBy(createdByUserId: string | null, updatedByUserId = createdByUserId) {
  return {
    companyLocationId: SHOP,
    createdByUserId,
    updatedByUserId,
  };
}

const merchant = { canViewAllShops: false };
const finance = { canViewAllShops: true };

describe("canViewBookNoteDay", () => {
  it("lets a merchant see the sheet they submitted", () => {
    expect(
      canViewBookNoteDay({
        viewScope: merchant,
        userId: MER1,
        day: sheetBy(MER1),
      }),
    ).toBe(true);
  });

  it("hides a colleague's sheet for the very same shop and day", () => {
    expect(
      canViewBookNoteDay({
        viewScope: merchant,
        userId: MER2,
        day: sheetBy(MER1),
      }),
    ).toBe(false);
  });

  it("lets whoever last saved a sheet still see it", () => {
    expect(
      canViewBookNoteDay({
        viewScope: merchant,
        userId: MER2,
        day: sheetBy(MER1, MER2),
      }),
    ).toBe(true);
  });

  it("shows finance every sheet regardless of submitter", () => {
    expect(
      canViewBookNoteDay({
        viewScope: finance,
        userId: "user_finance",
        day: sheetBy(MER1),
      }),
    ).toBe(true);
  });

  it("hides an unowned sheet from an anonymous caller", () => {
    expect(
      canViewBookNoteDay({
        viewScope: merchant,
        userId: null,
        day: sheetBy(MER1),
      }),
    ).toBe(false);
  });

  it("does not treat a null submitter as a match for a null viewer", () => {
    expect(
      canViewBookNoteDay({
        viewScope: merchant,
        userId: null,
        day: sheetBy(null),
      }),
    ).toBe(false);
  });
});
