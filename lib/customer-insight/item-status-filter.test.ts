import { describe, expect, it } from "vitest";

import { normalizeInsightItemStatusCategories } from "@/lib/customer-insight/item-status-filter";

describe("normalizeInsightItemStatusCategories", () => {
  it("keeps known categories and drops junk", () => {
    expect(
      normalizeInsightItemStatusCategories([
        "VAT_TOP_PRIORITY_BRAND",
        "bogus",
        "VAT_TOP_PRIORITY_BRAND",
        " NEWLY_ADDED ",
      ])
    ).toEqual(["VAT_TOP_PRIORITY_BRAND", "NEWLY_ADDED"]);
  });

  it("returns empty for nullish", () => {
    expect(normalizeInsightItemStatusCategories(null)).toEqual([]);
    expect(normalizeInsightItemStatusCategories(undefined)).toEqual([]);
    expect(normalizeInsightItemStatusCategories([])).toEqual([]);
  });
});
