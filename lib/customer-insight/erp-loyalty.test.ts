import { describe, expect, it } from "vitest";

import {
  effectiveLoyaltyTierKey,
  higherAssignedLoyaltyTier,
  mapErpCustomerGroupToLoyaltyTier,
} from "@/lib/customer-insight/erp-loyalty";

describe("mapErpCustomerGroupToLoyaltyTier", () => {
  it("maps Gold / loyalcs to gold", () => {
    expect(mapErpCustomerGroupToLoyaltyTier("Gold")).toBe("gold");
    expect(mapErpCustomerGroupToLoyaltyTier("loyalcs")).toBe("gold");
  });

  it("maps Platinum / loyalcs2 to platinum", () => {
    expect(mapErpCustomerGroupToLoyaltyTier("Platinum")).toBe("platinum");
    expect(mapErpCustomerGroupToLoyaltyTier("loyalcs2")).toBe("platinum");
  });

  it("ignores Individual and other groups (no OS→ERP write)", () => {
    expect(mapErpCustomerGroupToLoyaltyTier("Individual")).toBeNull();
    expect(mapErpCustomerGroupToLoyaltyTier("Commercial")).toBeNull();
    expect(mapErpCustomerGroupToLoyaltyTier(null)).toBeNull();
  });
});

describe("higherAssignedLoyaltyTier", () => {
  it("keeps platinum over gold", () => {
    expect(higherAssignedLoyaltyTier("gold", "platinum")).toBe("platinum");
    expect(higherAssignedLoyaltyTier("platinum", "gold")).toBe("platinum");
  });
});

describe("effectiveLoyaltyTierKey", () => {
  it("lets ERP Gold override computed Standard", () => {
    expect(effectiveLoyaltyTierKey("gold", "standard")).toBe("gold");
  });

  it("keeps computed platinum over assigned gold", () => {
    expect(effectiveLoyaltyTierKey("gold", "platinum")).toBe("platinum");
  });
});
