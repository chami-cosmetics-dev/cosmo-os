import { describe, expect, it } from "vitest";

import {
  buildShopStockRows,
  summarizeShopStockLocation,
  summarizeShopStockLocationByPriority,
  summarizeShopStockDashboardCard,
} from "@/lib/shop-stock-status/calc";
import {
  ONLINE_STOCK_COLUMNS,
  SHOP_STOCK_COLUMNS,
  shopStockBandOf,
  type ShopStockColumn,
  type ShopStockRow,
} from "@/lib/shop-stock-status/config";
import {
  buildCommonSkuRows,
  parseExcludedSkus,
  type StockHealthItem,
} from "@/lib/stock-health/calc";

const item = (sku: string, priority: string | null, itemName: string | null = null): StockHealthItem => ({
  sku,
  brand: null,
  priority,
  siteStatus: "active",
  itemName,
});

const columns: ShopStockColumn[] = [
  { key: "a", label: "A", warehouses: ["Shop A - X", "Shop A - Y"], ropColumnKeys: ["ra", "ra2"] },
  { key: "b", label: "B", warehouses: ["Shop B - X"], ropColumnKeys: ["rb"] },
  { key: "c", label: "C", warehouses: ["Main - X"], ropColumnKeys: ["rc"] },
];

describe("shopStockBandOf", () => {
  it("fails below 50%, yellow from 50% to 100% inclusive, green above 100%", () => {
    expect(shopStockBandOf(49.9)).toBe("fail");
    expect(shopStockBandOf(50)).toBe("pass");
    expect(shopStockBandOf(100)).toBe("pass");
    expect(shopStockBandOf(100.1)).toBe("full");
  });
});

describe("Online tab columns", () => {
  it("each company is part of the Shops tab's Online column, and none is listed twice", () => {
    const online = SHOP_STOCK_COLUMNS.find((c) => c.key === "online")!;
    for (const column of ONLINE_STOCK_COLUMNS) {
      for (const wh of column.warehouses) expect(online.warehouses).toContain(wh);
      for (const key of column.ropColumnKeys) expect(online.ropColumnKeys).toContain(key);
    }
    expect(new Set(ONLINE_STOCK_COLUMNS.flatMap((c) => c.ropColumnKeys))).toEqual(new Set(online.ropColumnKeys));
  });
});

describe("buildShopStockRows", () => {
  it("adds all variants' stock and ROP per column and counts Fail / Pass", () => {
    const commonRows = buildCommonSkuRows(
      [item("ABC_2", "Low", "Second"), item("ABC_1", "Top", "First")],
      new Map(),
      parseExcludedSkus([]),
    );
    const stock = new Map([
      ["ABC_1", new Map([["shop a - x", 2], ["shop b - x", 1], ["main - x", 9]])],
      ["ABC_2", new Map([["shop a - y", 3]])],
    ]);
    const rop = new Map([
      ["ABC_1", new Map([["ra", 4], ["rb", 4]])],
      ["ABC_2", new Map([["ra2", 6]])],
    ]);
    const [row] = buildShopStockRows(commonRows, stock, rop, columns);

    expect(row).toMatchObject({ commonSku: "ABC", itemName: "First", priority: "Top" });
    // A: (2 + 3) / (4 + 6) = 50% → Pass; B: 1 / 4 = 25% → Fail; C: no ROP → "-", not counted.
    expect(row.cells.a).toEqual({ stock: 5, rop: 10, percent: 50 });
    expect(row.cells.b).toEqual({ stock: 1, rop: 4, percent: 25 });
    expect(row.cells.c).toEqual({ stock: 9, rop: 0, percent: null });
    expect(row).toMatchObject({ fail: 1, pass: 1 });
  });
});

describe("summarizeShopStockLocation", () => {
  const row = (sku: string, stock: number, rop: number): ShopStockRow => ({
    commonSku: sku,
    itemName: null,
    priority: "Top",
    cells: { a: { stock, rop, percent: rop > 0 ? (stock / rop) * 100 : null } },
    fail: 0,
    pass: 0,
  });

  it("counts Pass (≥ 50%), Fail, No ROP with stock and 0 stock; leaves out no ROP + no stock", () => {
    const rows = [
      row("P1", 5, 10), // 50% → pass
      row("P2", 30, 10), // 300% → pass
      row("F1", 4, 10), // 40% → fail
      row("F0", 0, 6), // 0% → fail + 0 stock
      row("FN", -2, 6), // negative → fail + 0 stock
      row("N1", 7, 0), // no ROP, stock → No ROP - with stock
      row("N0", 0, 0), // no ROP, no stock → not counted
      row("NN", -1, 0), // no ROP, negative → not counted
    ];
    expect(summarizeShopStockLocation(rows, "a")).toEqual({
      pass: 2,
      fail: 3,
      noRopWithStock: 1,
      noRopNoStock: 0,
      total: 6,
      zeroStock: 2,
    });
    // Counting no ROP + no stock (Top): N0 and NN join the total, not 0' Stock.
    expect(summarizeShopStockLocation(rows, "a", { countNoRopNoStock: true })).toEqual({
      pass: 2,
      fail: 3,
      noRopWithStock: 1,
      noRopNoStock: 2,
      total: 8,
      zeroStock: 2,
    });
  });
});

describe("summarizeShopStockLocationByPriority", () => {
  it("splits one location's counts by priority; no ROP + no stock counted for Top only", () => {
    const cell = (stock: number, rop: number) => ({ a: { stock, rop, percent: rop > 0 ? (stock / rop) * 100 : null } });
    const rows: ShopStockRow[] = [
      { commonSku: "T1", itemName: null, priority: "Top", cells: cell(8, 10), fail: 0, pass: 0 },
      { commonSku: "T2", itemName: null, priority: "Top", cells: cell(0, 0), fail: 0, pass: 0 },
      { commonSku: "D1", itemName: null, priority: "Discontinue", cells: cell(3, 0), fail: 0, pass: 0 },
      { commonSku: "D2", itemName: null, priority: "Discontinue", cells: cell(0, 4), fail: 0, pass: 0 },
    ];
    expect(summarizeShopStockLocationByPriority(rows, "a")).toEqual({
      // Top counts its no ROP + no stock item (T2); Discontinue would leave it out.
      Top: { pass: 1, fail: 0, noRopWithStock: 0, noRopNoStock: 1, total: 2, zeroStock: 0 },
      Discontinue: { pass: 0, fail: 1, noRopWithStock: 1, noRopNoStock: 0, total: 2, zeroStock: 1 },
    });
  });
});

describe("summarizeShopStockDashboardCard", () => {
  it("sums ROP and stock of items with a ROP only; counts colours; ignores no ROP + no stock", () => {
    const cell = (stock: number, rop: number) => ({ a: { stock, rop, percent: rop > 0 ? (stock / rop) * 100 : null } });
    const r = (sku: string, stock: number, rop: number): ShopStockRow => ({
      commonSku: sku,
      itemName: null,
      priority: "Top",
      cells: cell(stock, rop),
      fail: 0,
      pass: 0,
    });
    const card = summarizeShopStockDashboardCard(
      [r("R", 2, 10), r("Y1", 5, 10), r("Y2", 10, 10), r("G", 30, 10), r("P", 7, 0), r("Z", 0, 0)],
      "a",
    );
    expect(card).toEqual({ totalRop: 40, totalStock: 47, fulfilment: 117.5, red: 1, yellow: 2, green: 1, purple: 1 });
    expect(summarizeShopStockDashboardCard([r("P", 7, 0)], "a").fulfilment).toBeNull();
  });
});
