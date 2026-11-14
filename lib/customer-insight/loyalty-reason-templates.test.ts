import { describe, expect, it } from "vitest";

import {
  currentLoyaltyReasonOsScope,
  loyaltyReasonVisibleOnOs,
  normalizeLoyaltyReasonLabel,
  SEEDED_LOYALTY_REASONS,
} from "@/lib/customer-insight/loyalty-reason-catalog";

describe("normalizeLoyaltyReasonLabel", () => {
  it("trims and collapses space, lowercases for dedupe", () => {
    expect(normalizeLoyaltyReasonLabel("  Potential   customer ")).toBe(
      "potential customer"
    );
  });
});

describe("seeded loyalty reasons", () => {
  it("ships the three agreed templates", () => {
    expect(SEEDED_LOYALTY_REASONS.map((row) => row.label)).toEqual([
      "Potential customer",
      "Cosmetics loyalty customer",
      "Supplementvault loyalty customer",
    ]);
  });

  it("hides cosmetics reason on Cosmo and supplementvault reason on Vault", () => {
    expect(loyaltyReasonVisibleOnOs("vault", false)).toBe(false);
    expect(loyaltyReasonVisibleOnOs("cosmo", true)).toBe(false);
    expect(loyaltyReasonVisibleOnOs("both", false)).toBe(true);
    expect(loyaltyReasonVisibleOnOs("both", true)).toBe(true);
    expect(loyaltyReasonVisibleOnOs("vault", true)).toBe(true);
    expect(loyaltyReasonVisibleOnOs("cosmo", false)).toBe(true);
  });

  it("maps deployment to os scope", () => {
    expect(currentLoyaltyReasonOsScope(true)).toBe("vault");
    expect(currentLoyaltyReasonOsScope(false)).toBe("cosmo");
  });
});
