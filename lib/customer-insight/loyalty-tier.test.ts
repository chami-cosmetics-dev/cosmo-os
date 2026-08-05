import { describe, expect, it } from "vitest";

import {
  buildLoyaltyDto,
  classifyLoyaltyTierKey,
  LOYALTY_GOLD_MIN,
  LOYALTY_PLATINUM_ABOVE,
} from "@/lib/customer-insight/loyalty-tier";

describe("classifyLoyaltyTierKey", () => {
  it("maps below gold min to standard", () => {
    expect(classifyLoyaltyTierKey(LOYALTY_GOLD_MIN - 1)).toBe("standard");
    expect(classifyLoyaltyTierKey(0)).toBe("standard");
  });

  it("maps inclusive gold band", () => {
    expect(classifyLoyaltyTierKey(LOYALTY_GOLD_MIN)).toBe("gold");
    expect(classifyLoyaltyTierKey(LOYALTY_PLATINUM_ABOVE)).toBe("gold");
    expect(classifyLoyaltyTierKey(185_000)).toBe("gold");
  });

  it("maps above platinum threshold", () => {
    expect(classifyLoyaltyTierKey(LOYALTY_PLATINUM_ABOVE + 1)).toBe("platinum");
  });
});

describe("buildLoyaltyDto", () => {
  it("sets loyalcs / loyalcs2 codes", () => {
    expect(buildLoyaltyDto(100_000).code).toBe("loyalcs");
    expect(buildLoyaltyDto(250_001).code).toBe("loyalcs2");
    expect(buildLoyaltyDto(50_000).code).toBeNull();
  });
});
