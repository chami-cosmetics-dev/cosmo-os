import { describe, expect, it } from "vitest";

import { loyaltyRespondedRecipientIds } from "@/lib/customer-insight/loyalty-notify";
import {
  canAssignLoyaltyTier,
  canAssignOrUpgradeLoyaltyTier,
  isLoyaltyEligibleByTotal,
  nextOutreachStatus,
  pendingLoyaltySuggestion,
} from "@/lib/customer-insight/loyalty-outreach";

describe("loyalty-outreach", () => {
  it("gates gold and platinum bands", () => {
    expect(isLoyaltyEligibleByTotal(100_000)).toBe(true);
    expect(canAssignLoyaltyTier("platinum", 200_000)).toBe(false);
    expect(canAssignLoyaltyTier("platinum", 250_000)).toBe(true);
  });

  it("advances outreach status", () => {
    expect(nextOutreachStatus("loyalty_informed")).toBe("contacted");
  });
});

describe("pendingLoyaltySuggestion", () => {
  it("suggests gold or platinum for unassigned spend", () => {
    expect(pendingLoyaltySuggestion(null, 120_000)).toEqual({
      suggestedTier: "gold",
      kind: "new",
      currentAssigned: null,
    });
    expect(pendingLoyaltySuggestion(null, 250_000)).toEqual({
      suggestedTier: "platinum",
      kind: "new",
      currentAssigned: null,
    });
    expect(pendingLoyaltySuggestion(null, 90_000)).toBeNull();
  });

  it("suggests platinum upgrade when assigned gold and spend hits platinum", () => {
    expect(pendingLoyaltySuggestion("gold", 249_999)).toBeNull();
    expect(pendingLoyaltySuggestion("gold", 250_000)).toEqual({
      suggestedTier: "platinum",
      kind: "upgrade",
      currentAssigned: "gold",
    });
    expect(pendingLoyaltySuggestion("platinum", 400_000)).toBeNull();
  });
});

describe("canAssignOrUpgradeLoyaltyTier", () => {
  it("allows gold→platinum when spend is in platinum band", () => {
    expect(
      canAssignOrUpgradeLoyaltyTier({
        tier: "platinum",
        lifetimeTotal: 250_000,
        currentAssigned: "gold",
      })
    ).toBe(true);
    expect(
      canAssignOrUpgradeLoyaltyTier({
        tier: "gold",
        lifetimeTotal: 120_000,
        currentAssigned: "gold",
      })
    ).toBe(false);
    expect(
      canAssignOrUpgradeLoyaltyTier({
        tier: "platinum",
        lifetimeTotal: 250_000,
        currentAssigned: "platinum",
      })
    ).toBe(false);
  });
});

describe("loyaltyRespondedRecipientIds", () => {
  it("drops the actor and dedupes", () => {
    expect(loyaltyRespondedRecipientIds(["a", "b", "a", "c"], "b")).toEqual([
      "a",
      "c",
    ]);
  });
});
