import { describe, expect, it } from "vitest";

import { columnsForOutletOrder, withShopWarehousesOnly } from "@/lib/item-trends/outlets";
import type { OsfResolvedColumn } from "@/lib/osf/column-config";

function quartile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * q);
  return sorted[idx] ?? 0;
}

function col(partial: Partial<OsfResolvedColumn> & { key: string; label: string }): OsfResolvedColumn {
  return {
    id: `col-${partial.key}`,
    companyLocationId: null,
    companyLocationName: null,
    erpnextInstanceId: null,
    directWarehouses: [],
    includeInStock: true,
    includeInRop: true,
    sortOrder: 0,
    active: true,
    warehouses: [],
    ...partial,
  };
}

describe("outlet transfer quartiles", () => {
  it("identifies bottom and top quartile speeds", () => {
    const speeds = [0.1, 0.2, 0.5, 1.2, 3.0];
    expect(quartile(speeds, 0.25)).toBe(0.2);
    expect(quartile(speeds, 0.75)).toBe(1.2);
  });
});

describe("withShopWarehousesOnly", () => {
  it("keeps shop warehouses and drops Main", () => {
    const narrowed = withShopWarehousesOnly(
      col({
        key: "lmj",
        label: "LMJ",
        companyLocationId: "loc-lmj",
        warehouses: ["Main Warehouse - LMJ", "Shop Warehouse - LMJ"],
      }),
    );
    expect(narrowed?.warehouses).toEqual(["Shop Warehouse - LMJ"]);
  });

  it("drops Cosmetics.lk Main-only columns", () => {
    expect(
      withShopWarehousesOnly(
        col({
          key: "cosmetics_lk",
          label: "Cosmetics.lk",
          companyLocationId: "loc-web",
          warehouses: ["Main Warehouse - Cosmo"],
        }),
      ),
    ).toBeNull();
  });
});

describe("columnsForOutletOrder", () => {
  const gcc = col({
    key: "cosmo_shop_gcc",
    label: "GCC Shop",
    warehouses: ["GCC Shop Warehouse - Cosmo"],
  });
  const lmj = col({
    key: "lmj",
    label: "LMJ",
    companyLocationId: "loc-lmj",
    warehouses: ["Shop Warehouse - LMJ"],
  });
  const warehouseToCols = new Map([
    ["gcc shop warehouse - cosmo", [gcc]],
    ["shop warehouse - lmj", [lmj]],
  ]);
  const locationToCols = new Map([["loc-lmj", [lmj]]]);

  it("attributes Cosmetics.lk POS to the shop warehouse column", () => {
    const cols = columnsForOutletOrder({
      companyLocationId: "loc-web",
      erpnextWarehouse: "GCC Shop Warehouse - Cosmo",
      sourceName: "erpnext-pos",
      locationToCols,
      warehouseToCols,
    });
    expect(cols.map((c) => c.key)).toEqual(["cosmo_shop_gcc"]);
  });

  it("ignores Cosmetics.lk website orders without a shop warehouse", () => {
    const cols = columnsForOutletOrder({
      companyLocationId: "loc-web",
      erpnextWarehouse: null,
      sourceName: "shopify",
      locationToCols,
      warehouseToCols,
    });
    expect(cols).toEqual([]);
  });

  it("attributes trading POS by location when warehouse blank", () => {
    const cols = columnsForOutletOrder({
      companyLocationId: "loc-lmj",
      erpnextWarehouse: null,
      sourceName: "erpnext-pos",
      locationToCols,
      warehouseToCols,
    });
    expect(cols.map((c) => c.key)).toEqual(["lmj"]);
  });

  it("matches shop warehouse names fuzzily", () => {
    const cols = columnsForOutletOrder({
      companyLocationId: "loc-web",
      erpnextWarehouse: "GCC Shop Warehouse - Cosmo - Transit",
      sourceName: "erpnext-pos",
      locationToCols,
      warehouseToCols,
    });
    expect(cols.map((c) => c.key)).toEqual(["cosmo_shop_gcc"]);
  });
});
