import { describe, expect, it } from "vitest";

import {
  UNMAPPED_DISTRICT,
  classifyDistrictGrowthStatus,
  computeExpansionScore,
  rollupDistrictTotals,
} from "@/lib/item-trends/district";

describe("rollupDistrictTotals", () => {
  it("aggregates units and amount per district", () => {
    const map = rollupDistrictTotals([
      { district: "Colombo", quantity: 10, amount: 1000 },
      { district: "Colombo", quantity: 5, amount: 500 },
      { district: "Gampaha", quantity: 3, amount: 300 },
    ]);
    expect(map.get("Colombo")).toEqual({ units: 15, amount: 1500 });
    expect(map.get("Gampaha")).toEqual({ units: 3, amount: 300 });
  });

  it("maps empty district to Unmapped bucket", () => {
    const map = rollupDistrictTotals([{ district: "", quantity: 2, amount: 50 }]);
    expect(map.get(UNMAPPED_DISTRICT)).toEqual({ units: 2, amount: 50 });
  });
});

describe("classifyDistrictGrowthStatus", () => {
  it("marks emerging when prior low and current meaningful", () => {
    expect(classifyDistrictGrowthStatus(8, 2, 300)).toBe("emerging");
  });

  it("marks growing, declining, stable from change pct", () => {
    expect(classifyDistrictGrowthStatus(20, 10, 15)).toBe("growing");
    expect(classifyDistrictGrowthStatus(8, 20, -40)).toBe("declining");
    expect(classifyDistrictGrowthStatus(10, 10, 2)).toBe("stable");
  });
});

describe("computeExpansionScore", () => {
  it("ranks high delivery + low shop coverage higher", () => {
    const high = computeExpansionScore({
      deliveryUnits: 100,
      shopUnits: 10,
      growthPct: 20,
      maxDeliveryUnits: 100,
    });
    const low = computeExpansionScore({
      deliveryUnits: 20,
      shopUnits: 18,
      growthPct: 5,
      maxDeliveryUnits: 100,
    });
    expect(high).toBeGreaterThan(low);
  });
});
