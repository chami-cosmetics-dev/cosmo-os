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
  it("maps below 100k to standard", () => {
    expect(classifyLoyaltyTierKey(0)).toBe("standard");
    expect(classifyLoyaltyTierKey(75_000)).toBe("standard");
    expect(classifyLoyaltyTierKey(LOYALTY_GOLD_MIN - 1)).toBe("standard");
  });

  it("maps 100k inclusive up to below platinum as gold", () => {
    expect(classifyLoyaltyTierKey(LOYALTY_GOLD_MIN)).toBe("gold");
    expect(classifyLoyaltyTierKey(100_000)).toBe("gold");
    expect(classifyLoyaltyTierKey(249_999)).toBe("gold");
  });

  it("maps 250k inclusive as platinum", () => {
    expect(classifyLoyaltyTierKey(LOYALTY_PLATINUM_MIN)).toBe("platinum");
    expect(classifyLoyaltyTierKey(250_000)).toBe("platinum");
    expect(classifyLoyaltyTierKey(300_000)).toBe("platinum");
  });
});

describe("push bands", () => {
  it("Push to Gold is ≥75k and <100k", () => {
    expect(isPushToGold(74_999)).toBe(false);
    expect(isPushToGold(75_000)).toBe(true);
    expect(isPushToGold(99_999)).toBe(true);
    expect(isPushToGold(100_000)).toBe(false);
    expect(isPushToGold(200_000)).toBe(false);
  });

  it("Push to Platinum is ≥200k and <250k", () => {
    expect(isPushToPlatinum(199_999)).toBe(false);
    expect(isPushToPlatinum(200_000)).toBe(true);
    expect(isPushToPlatinum(249_999)).toBe(true);
    expect(isPushToPlatinum(250_000)).toBe(false);
  });
});

describe("buildLoyaltyDto", () => {
  it("sets loyalcs / loyalcs2 codes", () => {
    expect(buildLoyaltyDto(100_000).code).toBe("loyalcs");
    expect(buildLoyaltyDto(250_000).code).toBe("loyalcs2");
    expect(buildLoyaltyDto(50_000).code).toBeNull();
    expect(buildLoyaltyDto(100_000).thresholds.platinumMin).toBe(250_000);
  });
});
