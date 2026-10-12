import { describe, expect, it } from "vitest";

import {
  buildInstanceStockSources,
  classifyStockLookup,
  sortStockSources,
  type StockSource,
} from "./stock-sources";

const warehouses = [
  { name: "Main Warehouse - Cosmo", company: "Cosmetics.lk", is_group: 0 },
  { name: "Negombo Shop - Cosmo", company: "Cosmetics.lk", is_group: 0 },
  { name: "All Warehouses - Cosmo", company: "Cosmetics.lk", is_group: 1 },
  { name: "Goods In Transit - Cosmo", company: "Cosmetics.lk", is_group: 0, warehouse_type: "Transit" },
  { name: "Old Shop - Cosmo", company: "Cosmetics.lk", is_group: 0, disabled: 1 },
  { name: "Main - OO", company: "Origins Online", is_group: 0 },
];

describe("buildInstanceStockSources", () => {
  it("keeps only real warehouses with available stock, excluding Shopify's own warehouse", () => {
    const sources = buildInstanceStockSources({
      instanceId: "erp1",
      instanceLabel: "ERP1",
      bins: [
        { warehouse: "Main Warehouse - Cosmo", actual_qty: 9 },
        { warehouse: "Negombo Shop - Cosmo", actual_qty: 5, reserved_qty: 2, projected_qty: 7 },
        { warehouse: "All Warehouses - Cosmo", actual_qty: 50 },
        { warehouse: "Goods In Transit - Cosmo", actual_qty: 4 },
        { warehouse: "Old Shop - Cosmo", actual_qty: 4 },
        { warehouse: "Unknown - X", actual_qty: 4 },
        { warehouse: "Main - OO", actual_qty: 4 },
      ],
      warehouses,
      excludeWarehouses: ["Main Warehouse - Cosmo"],
      isExcludedCompany: (c) => c.toLowerCase() === "origins online",
    });
    expect(sources).toEqual([
      {
        instanceId: "erp1",
        instanceLabel: "ERP1",
        erpCompany: "Cosmetics.lk",
        warehouse: "Negombo Shop - Cosmo",
        actualQty: 5,
        reservedQty: 2,
        projectedQty: 7,
        availableQty: 3,
      },
    ]);
  });

  it("drops warehouses where everything is reserved", () => {
    const sources = buildInstanceStockSources({
      instanceId: "erp1",
      instanceLabel: "ERP1",
      bins: [{ warehouse: "Negombo Shop - Cosmo", actual_qty: 2, reserved_qty: 2 }],
      warehouses,
    });
    expect(sources).toEqual([]);
  });
});

function src(instanceId: string, erpCompany: string, availableQty: number): StockSource {
  return {
    instanceId,
    instanceLabel: instanceId,
    erpCompany,
    warehouse: `${erpCompany}-${availableQty}`,
    availableQty,
    actualQty: availableQty,
    reservedQty: 0,
    projectedQty: availableQty,
  };
}

describe("sortStockSources", () => {
  it("orders by instance, then company, then qty desc", () => {
    const sorted = sortStockSources(
      [src("erp2", "SPK", 1), src("erp2", "Chami", 3), src("erp1", "Cosmetics.lk", 1), src("erp2", "Chami", 8)],
      ["erp1", "erp2"],
    );
    expect(sorted.map((s) => s.warehouse)).toEqual(["Cosmetics.lk-1", "Chami-8", "Chami-3", "SPK-1"]);
  });
});

describe("classifyStockLookup", () => {
  it("never reports none when an instance failed", () => {
    const failed = [{ instanceId: "erp2", instanceLabel: "ERP2", error: "down" }];
    expect(classifyStockLookup({ sources: [], failedInstances: failed })).toBe("error");
    expect(classifyStockLookup({ sources: [], failedInstances: [] })).toBe("none");
    expect(classifyStockLookup({ sources: [src("erp1", "A", 1)], failedInstances: failed })).toBe("found");
  });
});
