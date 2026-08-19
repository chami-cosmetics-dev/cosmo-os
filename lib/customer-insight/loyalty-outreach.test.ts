import { describe, expect, it } from "vitest";

import { loyaltyRespondedRecipientIds } from "@/lib/customer-insight/loyalty-notify";
import {
  canAssignLoyaltyTier,
  isLoyaltyEligibleByTotal,
  nextOutreachStatus,
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

describe("loyaltyRespondedRecipientIds", () => {
  it("drops the actor and dedupes", () => {
    expect(loyaltyRespondedRecipientIds(["a", "b", "a", "c"], "b")).toEqual([
      "a",
      "c",
    ]);
  });
});
