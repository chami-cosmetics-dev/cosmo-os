import { describe, expect, it } from "vitest";

import { isCosmeticsLkLocationName } from "@/lib/page-data/merchant-dashboard-cosmetics-lk";

describe("isCosmeticsLkLocationName", () => {
  it("matches common cosmetics.lk location labels", () => {
    expect(isCosmeticsLkLocationName("Cosmetics.lk")).toBe(true);
    expect(isCosmeticsLkLocationName("cosmetics.lk")).toBe(true);
    expect(isCosmeticsLkLocationName("Cosmetics lk")).toBe(true);
    expect(isCosmeticsLkLocationName("  Cosmetics.LK  ")).toBe(true);
  });

  it("rejects other locations", () => {
    expect(isCosmeticsLkLocationName("Nugegoda")).toBe(false);
    expect(isCosmeticsLkLocationName("Supplement Vault")).toBe(false);
    expect(isCosmeticsLkLocationName(null)).toBe(false);
    expect(isCosmeticsLkLocationName("")).toBe(false);
  });
});
