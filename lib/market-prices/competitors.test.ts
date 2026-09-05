import { describe, expect, it } from "vitest";

import {
  findCompetitorByNameOrSlug,
  FIXED_COMPETITORS,
  getCompetitorBySlug,
  validateCompetitorProductUrl,
} from "./competitors";

describe("competitors definitions and helpers", () => {
  it("contains exactly 6 fixed competitors", () => {
    expect(FIXED_COMPETITORS.length).toBe(6);
    expect(FIXED_COMPETITORS.map((c) => c.slug)).toEqual([
      "angels-beauty",
      "essentials",
      "liberty-store",
      "kiki-beauty",
      "dreams-of-ceylonese",
      "watsans",
    ]);
  });

  it("finds competitor by exact slug", () => {
    const comp = getCompetitorBySlug("liberty-store");
    expect(comp?.name).toBe("Liberty Store");
    expect(comp?.websiteDomain).toBe("libertystore.lk");
  });

  it("finds competitor by case-insensitive name or domain", () => {
    expect(findCompetitorByNameOrSlug("Angels Beauty")?.slug).toBe("angels-beauty");
    expect(findCompetitorByNameOrSlug("essentials.lk")?.slug).toBe("essentials");
    expect(findCompetitorByNameOrSlug("KIKI-BEAUTY")?.slug).toBe("kiki-beauty");
    expect(findCompetitorByNameOrSlug("watsans")?.slug).toBe("watsans");
    expect(findCompetitorByNameOrSlug("unknown")).toBeUndefined();
  });

  it("validates competitor URLs and checks matching domain", () => {
    const validMatch = validateCompetitorProductUrl(
      "https://libertystore.lk/products/cerave-lotion",
      "libertystore.lk",
    );
    expect(validMatch.valid).toBe(true);
    expect(validMatch.warning).toBeUndefined();

    const withWww = validateCompetitorProductUrl(
      "https://www.libertystore.lk/products/cerave-lotion",
      "libertystore.lk",
    );
    expect(withWww.valid).toBe(true);
    expect(withWww.warning).toBeUndefined();

    const mismatch = validateCompetitorProductUrl(
      "https://randomsite.com/products/cerave",
      "libertystore.lk",
    );
    expect(mismatch.valid).toBe(true);
    expect(mismatch.warning).toContain("does not match expected domain");

    const invalidUrl = validateCompetitorProductUrl("not a url");
    expect(invalidUrl.valid).toBe(false);
  });
});
