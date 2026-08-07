import { describe, expect, it } from "vitest";

import {
  buildLoyaltyDto,
  classifyLoyaltyTierKey,
  isPushToGold,
  isPushToPlatinum,
  LOYALTY_GOLD_MIN,
  LOYALTY_PLATINUM_MIN,
} from "@/lib/customer-insight/loyalty-tier";

describe("classifyLoyaltyTierKey", () => {
  it("maps below gold min to standard", () => {
    expect(classifyLoyaltyTierKey(LOYALTY_GOLD_MIN - 1)).toBe("standard");
    expect(classifyLoyaltyTierKey(0)).toBe("standard");
    expect(classifyLoyaltyTierKey(74_999)).toBe("standard");
  });

  it("maps inclusive gold band exclusive of platinum", () => {
    expect(classifyLoyaltyTierKey(LOYALTY_GOLD_MIN)).toBe("gold");
    expect(classifyLoyaltyTierKey(75_000)).toBe("gold");
    expect(classifyLoyaltyTierKey(199_999)).toBe("gold");
  });

  it("maps inclusive platinum threshold", () => {
    expect(classifyLoyaltyTierKey(LOYALTY_PLATINUM_MIN)).toBe("platinum");
    expect(classifyLoyaltyTierKey(200_000)).toBe("platinum");
    expect(classifyLoyaltyTierKey(250_000)).toBe("platinum");
  });
});

describe("push bands", () => {
  it("Push to Gold is ≥75k and <200k", () => {
    expect(isPushToGold(74_999)).toBe(false);
    expect(isPushToGold(75_000)).toBe(true);
    expect(isPushToGold(199_999)).toBe(true);
    expect(isPushToGold(200_000)).toBe(false);
  });

  it("Push to Platinum is ≥200k", () => {
    expect(isPushToPlatinum(199_999)).toBe(false);
    expect(isPushToPlatinum(200_000)).toBe(true);
  });
});

describe("buildLoyaltyDto", () => {
  it("sets loyalcs / loyalcs2 codes", () => {
    expect(buildLoyaltyDto(75_000).code).toBe("loyalcs");
    expect(buildLoyaltyDto(200_000).code).toBe("loyalcs2");
    expect(buildLoyaltyDto(50_000).code).toBeNull();
    expect(buildLoyaltyDto(75_000).thresholds.platinumMin).toBe(200_000);
  });
});
