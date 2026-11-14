import { describe, expect, it } from "vitest";

import {
  buildCommonSkuRows,
  buildOutOfStockRows,
  buildRopRows,
  parseExcludedSkus,
  ropGroupOf,
  summarizeRopStatus,
  type StockHealthItem,
} from "@/lib/stock-health/calc";

describe("ropGroupOf", () => {
  it("passes only above 50% of ROP", () => {
    expect(ropGroupOf(6, 10)).toBe("pass");
    expect(ropGroupOf(5, 10)).toBe("fail");
    expect(ropGroupOf(0, 10)).toBe("fail");
    expect(ropGroupOf(-2, 10)).toBe("fail");
  });

  it("splits No ROP by stock, treating stock <= 0 as no stock", () => {
    expect(ropGroupOf(0, 0)).toBe("noRopNoStock");
    expect(ropGroupOf(-3, 0)).toBe("noRopNoStock");
    expect(ropGroupOf(4, 0)).toBe("noRopWithStock");
  });
});

describe("summarizeRopStatus", () => {
  const none = parseExcludedSkus([]);
  const rowsFor = (items: StockHealthItem[], stock: Record<string, number>) =>
    buildCommonSkuRows(items, new Map(Object.entries(stock)), none);

  it("adds ROP and stock over all variants, one group per Common SKU", () => {
    const rows = rowsFor(
      [
        { sku: "ABC_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
        { sku: "ABC_2", brand: null, priority: "Low", siteStatus: "active", itemName: null },
        { sku: "XYZ_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
        { sku: "NOR_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
        { sku: "OUT_1", brand: null, priority: "Low", siteStatus: "active", itemName: null },
      ],
      { ABC_1: 3, ABC_2: 3, XYZ_1: 1, NOR_1: 5 },
    );
    const rop = new Map([
      ["ABC_1", 5],
      ["ABC_2", 5],
      ["XYZ_1", 10],
    ]);
    const { rows: result, grandTotal } = summarizeRopStatus(buildRopRows(rows, rop));

    // ABC: 6 / 10 = 60% → PASS; XYZ: 10% → FAIL; NOR: no ROP, stock 5; OUT: no ROP, no stock.
    expect(result.find((r) => r.status === "Top")).toEqual({
      status: "Top",
      fail: 1,
      noRopNoStock: 0,
      noRopWithStock: 1,
      pass: 1,
      total: 3,
      zeroStock: 0,
    });
    expect(result.find((r) => r.status === "Low")).toMatchObject({ noRopNoStock: 1, total: 1, zeroStock: 1 });
    expect(grandTotal).toEqual({ fail: 1, noRopNoStock: 1, noRopWithStock: 1, pass: 1, total: 4, zeroStock: 1 });
  });

  it("counts 0' Stock across groups without changing the total", () => {
    const rows = rowsFor(
      [
        { sku: "F_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
        { sku: "N_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
      ],
      { F_1: 0, N_1: -1 },
    );
    const { grandTotal } = summarizeRopStatus(buildRopRows(rows, new Map([["F_1", 4]])));
    expect(grandTotal).toMatchObject({ fail: 1, noRopNoStock: 1, total: 2, zeroStock: 2 });
  });

  it("uses ROP stored on the Common SKU itself", () => {
    const rows = rowsFor([{ sku: "P_1", brand: null, priority: "Top", siteStatus: "active", itemName: null }], { P_1: 9 });
    const { grandTotal } = summarizeRopStatus(buildRopRows(rows, new Map([["P", 10]])));
    expect(grandTotal.pass).toBe(1);
  });

  it("lists rows Top, Newly Added, Low, Discontinue; Blank only when present", () => {
    const rows = rowsFor([{ sku: "A_1", brand: null, priority: null, siteStatus: "active", itemName: null }], {});
    expect(summarizeRopStatus(buildRopRows(rows, new Map())).rows.map((r) => r.status)).toEqual([
      "Top",
      "Newly Added",
      "Low",
      "Discontinue",
      "Blank",
    ]);
    expect(summarizeRopStatus([]).rows.map((r) => r.status)).toEqual([
      "Top",
      "Newly Added",
      "Low",
      "Discontinue",
    ]);
  });
});

describe("buildOutOfStockRows", () => {
  const none = parseExcludedSkus([]);
  const item = (sku: string, priority: string | null, itemName: string | null = null): StockHealthItem => ({
    sku,
    brand: null,
    priority,
    siteStatus: "active",
    itemName,
  });
  const items = [
    item("NEW_1", "New"),
    item("ZED_1", "Top"),
    item("ABC_2", "Low", "Second"),
    item("ABC_1", "Top", "First"),
    item("LOW_1", "Low"),
    item("OLD_1", "Discontinued"),
    item("BLK_1", null),
    item("NEG_1", "Top"),
    item("HAS_1", "Top"),
    item("MIX_1", "Low"),
    item("MIX_2", "Low"),
  ];
  // MIX nets to 0 from +2 / -2, so it is out of stock as a whole; HAS is not.
  const stock = new Map(Object.entries({ NEG_1: -1, HAS_1: 4, MIX_1: 2, MIX_2: -2, LOW_1: 0 }));
  const commonRows = buildCommonSkuRows(items, stock, none);

  it("sorts Top, Low, Newly Added, Discontinue, Blank, then by Common SKU", () => {
    expect(buildOutOfStockRows(commonRows).map((r) => r.commonSku)).toEqual([
      "ABC", "NEG", "ZED", "LOW", "MIX", "NEW", "OLD", "BLK",
    ]);
  });

  it("lists every variant and the first variant's name", () => {
    expect(buildOutOfStockRows(commonRows)[0]).toEqual({
      status: "Top",
      commonSku: "ABC",
      itemName: "First",
      variantSkus: ["ABC_1", "ABC_2"],
    });
  });

  it("has exactly as many rows per priority as ROP Status's 0' Stock", () => {
    const ropRows = buildRopRows(commonRows, new Map());
    const list = buildOutOfStockRows(ropRows);
    const { rows, grandTotal } = summarizeRopStatus(ropRows);
    for (const row of rows) {
      expect(list.filter((r) => r.status === row.status)).toHaveLength(row.zeroStock);
    }
    expect(list).toHaveLength(grandTotal.zeroStock);
  });
});
