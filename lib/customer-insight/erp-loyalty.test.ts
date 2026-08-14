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
  it("uses ERP Gold even when spend is Standard", () => {
    expect(effectiveLoyaltyTierKey("gold", "standard")).toBe("gold");
  });

  it("stays Gold when spend would be Platinum but ERP is only Gold", () => {
    expect(effectiveLoyaltyTierKey("gold", "platinum")).toBe("gold");
  });

  it("stays Standard when unregistered even if spend is Platinum", () => {
    expect(effectiveLoyaltyTierKey(null, "platinum")).toBe("standard");
    expect(effectiveLoyaltyTierKey(undefined, "gold")).toBe("standard");
  });
});
