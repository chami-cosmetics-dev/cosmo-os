import { describe, expect, it } from "vitest";

import {
  availableManualLoyaltyTiers,
  canManualAssignLoyaltyTier,
} from "@/lib/customer-insight/loyalty-manual";

describe("availableManualLoyaltyTiers", () => {
  it("offers gold and platinum when standard and spend is below gold", () => {
    expect(availableManualLoyaltyTiers(null, 50_000)).toEqual(["gold", "platinum"]);
    expect(availableManualLoyaltyTiers(null, 99_999)).toEqual(["gold", "platinum"]);
  });

  it("offers only platinum when spend is gold-band but unassigned", () => {
    expect(availableManualLoyaltyTiers(null, 100_000)).toEqual(["platinum"]);
    expect(availableManualLoyaltyTiers(null, 249_999)).toEqual(["platinum"]);
  });

  it("offers platinum when already gold and spend is below platinum", () => {
    expect(availableManualLoyaltyTiers("gold", 80_000)).toEqual(["platinum"]);
    expect(availableManualLoyaltyTiers("gold", 120_000)).toEqual(["platinum"]);
  });

  it("offers nothing when spend already meets platinum or contact is platinum", () => {
    expect(availableManualLoyaltyTiers(null, 250_000)).toEqual([]);
    expect(availableManualLoyaltyTiers("gold", 250_000)).toEqual([]);
    expect(availableManualLoyaltyTiers("platinum", 10_000)).toEqual([]);
  });
});

describe("canManualAssignLoyaltyTier", () => {
  it("allows standard to gold below the gold limit", () => {
    expect(
      canManualAssignLoyaltyTier({
        tier: "gold",
        currentAssigned: null,
        lifetimeTotal: 40_000,
      })
    ).toBe(true);
  });

  it("blocks gold override when spend already qualifies for gold", () => {
    expect(
      canManualAssignLoyaltyTier({
        tier: "gold",
        currentAssigned: null,
        lifetimeTotal: 100_000,
      })
    ).toBe(false);
  });

  it("allows gold to platinum below the platinum limit", () => {
    expect(
      canManualAssignLoyaltyTier({
        tier: "platinum",
        currentAssigned: "gold",
        lifetimeTotal: 90_000,
      })
    ).toBe(true);
  });

  it("blocks assigning a tier the contact already holds", () => {
    expect(
      canManualAssignLoyaltyTier({
        tier: "gold",
        currentAssigned: "gold",
        lifetimeTotal: 10_000,
      })
    ).toBe(false);
  });
});
