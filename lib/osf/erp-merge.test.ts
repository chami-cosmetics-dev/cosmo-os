import { describe, expect, it } from "vitest";

import { mergeInstanceErpData, type InstanceErpData } from "@/lib/osf/erp-merge";

describe("mergeInstanceErpData", () => {
  it("picks latest purchase across instances and sums recent qty", () => {
    const erp1: InstanceErpData = {
      costs: new Map([["SKU1", { cost: 100, supplier: null }]]),
      purchases: new Map([
        ["SKU1", { supplier: "Cosmo Supplier", qty: 3, rate: 80, date: "2026-07-15", recentQty: 5 }],
      ]),
    };
    const erp2: InstanceErpData = {
      costs: new Map([["SKU1", { cost: 90, supplier: null }]]),
      purchases: new Map([
        ["SKU1", { supplier: "Trading Supplier", qty: 10, rate: 70, date: "2026-07-10", recentQty: 12 }],
      ]),
    };

    const { costMap, purchaseMap } = mergeInstanceErpData(["SKU1"], [erp1, erp2]);

    const p = purchaseMap.get("SKU1")!;
    expect(p.supplier).toBe("Cosmo Supplier"); // 07-15 is later than 07-10
    expect(p.qty).toBe(3);
    expect(p.date).toBe("2026-07-15");
    expect(p.recentQty).toBe(17); // 5 + 12 summed across instances
    expect(p.rate).toBe(80); // rate from the winning (latest) receipt
    // Cost aligns with the winning purchase instance (erp1)
    expect(costMap.get("SKU1")!.cost).toBe(100);
  });

  it("falls back to any non-null cost when preferred instance lacks it", () => {
    const erp1: InstanceErpData = {
      costs: new Map([["SKU2", { cost: null, supplier: null }]]),
      purchases: new Map([
        ["SKU2", { supplier: "A", qty: 1, rate: null, date: "2026-07-20", recentQty: 1 }],
      ]),
    };
    const erp2: InstanceErpData = {
      costs: new Map([["SKU2", { cost: 55, supplier: null }]]),
      purchases: new Map(),
    };

    const { costMap } = mergeInstanceErpData(["SKU2"], [erp1, erp2]);
    expect(costMap.get("SKU2")!.cost).toBe(55);
  });

  it("omits items with no data in any instance", () => {
    const empty: InstanceErpData = { costs: new Map(), purchases: new Map() };
    const { costMap, purchaseMap } = mergeInstanceErpData(["SKU3"], [empty]);
    expect(costMap.has("SKU3")).toBe(false);
    expect(purchaseMap.has("SKU3")).toBe(false);
  });
});
