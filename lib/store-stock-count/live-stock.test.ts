import { describe, expect, it } from "vitest";

import {
  applyLiveWarehouseQty,
  stockByWarehouseChanged,
  warehouseItemKey,
} from "@/lib/store-stock-count/live-stock";

describe("applyLiveWarehouseQty", () => {
  it("fills selected warehouses from live ERP bins and treats missing as 0", () => {
    const liveQty = new Map<string, number>([
      [warehouseItemKey("w-shop", "ORD19_1"), 3],
    ]);
    expect(
      applyLiveWarehouseQty({
        warehouses: [{ key: "w-shop" }, { key: "w-main" }],
        sku: "ORD19_1",
        liveQty,
      }),
    ).toEqual({
      stockByWarehouse: { "w-shop": 3, "w-main": 0 },
      stockSum: 3,
    });
  });
});

describe("stockByWarehouseChanged", () => {
  it("detects live qty drift", () => {
    expect(
      stockByWarehouseChanged({ "w-shop": 8 }, { "w-shop": 3 }),
    ).toBe(true);
    expect(
      stockByWarehouseChanged({ "w-shop": 3 }, { "w-shop": 3 }),
    ).toBe(false);
  });
});
