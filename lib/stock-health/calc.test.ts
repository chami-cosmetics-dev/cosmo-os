import { describe, expect, it } from "vitest";

import {
  buildCommonSkuRows,
  commonSkuOf,
  excludingRuleOf,
  parseExcludedSkus,
  stockHealthSkipReason,
  stockHealthStatusOf,
  summarizeByStatus,
  type StockHealthItem,
} from "@/lib/stock-health/calc";

describe("stockHealthStatusOf", () => {
  it("matches ERP spellings loosely", () => {
    expect(stockHealthStatusOf("Top")).toBe("Top");
    expect(stockHealthStatusOf(" low ")).toBe("Low");
    expect(stockHealthStatusOf("Newly added")).toBe("Newly Added");
    expect(stockHealthStatusOf("New")).toBe("Newly Added");
    expect(stockHealthStatusOf("Discontinued")).toBe("Discontinue");
    expect(stockHealthStatusOf("Medium")).toBe("Blank");
    expect(stockHealthStatusOf(null)).toBe("Blank");
  });
});

describe("commonSkuOf", () => {
  it("cuts the variant suffix", () => {
    expect(commonSkuOf({ sku: "ABC_1", brand: "X", priority: null, siteStatus: "active", itemName: null })).toBe("ABC");
    expect(commonSkuOf({ sku: "abc", brand: null, priority: null, siteStatus: "active", itemName: null })).toBe("ABC");
  });

  it("cuts at the last underscore, even without a numeric suffix", () => {
    expect(commonSkuOf({ sku: "Test_1-1", brand: null, priority: null, siteStatus: "active", itemName: null })).toBe("TEST");
    expect(commonSkuOf({ sku: "Test_1-2", brand: null, priority: null, siteStatus: "active", itemName: null })).toBe("TEST");
    expect(commonSkuOf({ sku: "FL_01_2", brand: "Flawless", priority: null, siteStatus: "active", itemName: null })).toBe("FL_01");
    expect(commonSkuOf({ sku: "_ABC", brand: null, priority: null, siteStatus: "active", itemName: null })).toBe("");
  });

  it("keeps Golden Rose SKUs whole", () => {
    expect(commonSkuOf({ sku: "GR12_3", brand: "Golden Rose", priority: null, siteStatus: "active", itemName: null })).toBe("GR12_3");
  });
});

describe("summarizeByStatus", () => {
  const stock = (entries: Record<string, number>) => new Map(Object.entries(entries));
  const none = parseExcludedSkus([]);
  const excluded = parseExcludedSkus(["SGV1000", "test-1", "bu0*"]);

  it("counts a Common SKU once under its highest status, with all variants' stock", () => {
    const items: StockHealthItem[] = [
      { sku: "ABC_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
      { sku: "ABC_2", brand: null, priority: "Top", siteStatus: "active", itemName: null },
      { sku: "ABC_3", brand: null, priority: "Low", siteStatus: "active", itemName: null },
    ];
    const rows = summarizeByStatus(items, stock({ ABC_1: 4, ABC_2: 5, ABC_3: 5 }), none);
    expect(rows).toEqual([
      { status: "Top", count: 1, stock: 14 },
      { status: "Low", count: 0, stock: 0 },
      { status: "Newly Added", count: 0, stock: 0 },
      { status: "Discontinue", count: 0, stock: 0 },
      { status: "Blank", count: 0, stock: 0 },
    ]);
  });

  it("includes stock of variants with no priority; groups with none count as Blank", () => {
    const items: StockHealthItem[] = [
      { sku: "D_1", brand: null, priority: "Discontinued", siteStatus: "active", itemName: null },
      { sku: "D_2", brand: null, priority: null, siteStatus: "active", itemName: null },
      { sku: "N_1", brand: null, priority: "Newly added", siteStatus: "active", itemName: null },
      { sku: "N_2", brand: null, priority: "Low", siteStatus: "active", itemName: null },
      { sku: "Z_1", brand: null, priority: null, siteStatus: "active", itemName: null },
    ];
    const rows = summarizeByStatus(items, stock({ D_1: 1, D_2: 2, N_1: 3, N_2: 4, Z_1: 99 }), none);
    expect(rows).toEqual([
      { status: "Top", count: 0, stock: 0 },
      { status: "Low", count: 1, stock: 7 },
      { status: "Newly Added", count: 0, stock: 0 },
      { status: "Discontinue", count: 1, stock: 3 },
      { status: "Blank", count: 1, stock: 99 },
    ]);
  });

  it("skips items with no Common SKU", () => {
    const items: StockHealthItem[] = [
      { sku: "_PROBE", brand: null, priority: "Newly added", siteStatus: "active", itemName: null },
      { sku: "Kit_1-1", brand: null, priority: "Low", siteStatus: "active", itemName: null },
      { sku: "Kit_1-2", brand: null, priority: "Low", siteStatus: "active", itemName: null },
    ];
    const rows = summarizeByStatus(items, stock({ _PROBE: 7, "KIT_1-1": 1, "KIT_1-2": 2 }), none);
    expect(rows[1]).toEqual({ status: "Low", count: 1, stock: 3 });
    expect(rows[2]).toEqual({ status: "Newly Added", count: 0, stock: 0 });
  });

  it("leaves out excluded Common SKUs (any case)", () => {
    const items: StockHealthItem[] = [
      { sku: "SGV1000", brand: null, priority: "Top", siteStatus: "active", itemName: null },
      { sku: "test-1", brand: null, priority: "Low", siteStatus: "active", itemName: null },
      { sku: "KEEP_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
    ];
    const rows = summarizeByStatus(items, stock({ SGV1000: 50, "TEST-1": 5, KEEP_1: 2 }), excluded);
    expect(rows[0]).toEqual({ status: "Top", count: 1, stock: 2 });
    expect(rows[1]).toEqual({ status: "Low", count: 0, stock: 0 });
  });

  it("leaves out every Common SKU matched by a prefix rule (bundles, incl. new ones)", () => {
    const items: StockHealthItem[] = [
      { sku: "BU001", brand: null, priority: "Top", siteStatus: "active", itemName: null },
      { sku: "BU099_2", brand: null, priority: "Low", siteStatus: "active", itemName: null },
      { sku: "BUX_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
    ];
    const rows = buildCommonSkuRows(items, stock({ BU001: 4, BU099_2: 1, BUX_1: 3 }), excluded);
    expect(rows.map((r) => r.commonSku)).toEqual(["BUX"]);
    expect(excludingRuleOf("BU099", excluded)).toBe("BU0*");
    expect(excludingRuleOf("BUX", excluded)).toBeNull();
  });

  it("counts a rule-matched SKU marked as counted anyway", () => {
    const withException = parseExcludedSkus(["BU0*"], ["bu0-serum"]);
    const items: StockHealthItem[] = [
      { sku: "BU001", brand: null, priority: "Top", siteStatus: "active", itemName: null },
      { sku: "BU0-SERUM_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
    ];
    const rows = buildCommonSkuRows(items, stock({ BU001: 4, "BU0-SERUM_1": 2 }), withException);
    expect(rows.map((r) => r.commonSku)).toEqual(["BU0-SERUM"]);
  });

  it("builds one row per Common SKU and gives skip reasons", () => {
    const items: StockHealthItem[] = [
      { sku: "ABC_1", brand: "B", priority: "Low", siteStatus: "active", itemName: null },
      { sku: "ABC_2", brand: "B", priority: "Top", siteStatus: "active", itemName: null },
      { sku: "SGV1000", brand: null, priority: "Top", siteStatus: "active", itemName: null },
      { sku: "_X", brand: null, priority: "Top", siteStatus: "active", itemName: null },
    ];
    const rows = buildCommonSkuRows(items, stock({ ABC_1: 1, ABC_2: 2 }), excluded);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ commonSku: "ABC", status: "Top", stock: 3 });
    expect(stockHealthSkipReason(items[0], excluded, 0)).toBeNull();
    expect(stockHealthSkipReason(items[2], excluded, 0)).toBe("Excluded SKU");
    expect(stockHealthSkipReason(items[3], excluded, 0)).toBe("No Common SKU");
  });

  it("counts each Golden Rose SKU separately", () => {
    const items: StockHealthItem[] = [
      { sku: "GR_1", brand: "Golden Rose", priority: "Top", siteStatus: "active", itemName: null },
      { sku: "GR_2", brand: "Golden Rose", priority: "Top", siteStatus: "active", itemName: null },
    ];
    const rows = summarizeByStatus(items, stock({ GR_1: 2, GR_2: 3 }), none);
    expect(rows[0]).toEqual({ status: "Top", count: 2, stock: 5 });
  });
});

describe("website status", () => {
  it("leaves out website drafts with no stock, counts drafts with stock and items not on the website", () => {
    const items: StockHealthItem[] = [
      { sku: "ABC_1", brand: null, priority: "Top", siteStatus: "active", itemName: null },
      { sku: "ABC_2", brand: null, priority: "Top", siteStatus: "draft", itemName: null },
      { sku: "DEF_1", brand: null, priority: "Low", siteStatus: null, itemName: null },
      { sku: "GR123", brand: "Golden Rose", priority: "Low", siteStatus: "draft", itemName: null },
      { sku: "GR124", brand: "Golden Rose", priority: "Low", siteStatus: "draft", itemName: null },
    ];
    const none = parseExcludedSkus([]);
    const stock = new Map([["ABC_1", 3], ["ABC_2", 0], ["DEF_1", 1], ["GR123", 4], ["GR124", -1]]);
    const rows = buildCommonSkuRows(items, stock, none);
    expect(rows.map((r) => r.commonSku)).toEqual(["ABC", "DEF", "GR123"]);
    expect(rows[0]).toMatchObject({ commonSku: "ABC", stock: 3, variants: [items[0]] });
    expect(rows[2]).toMatchObject({ commonSku: "GR123", stock: 4 });
    expect(stockHealthSkipReason(items[1], none, 0)).toBe("Draft on website (no stock)");
    expect(stockHealthSkipReason(items[1], none, 5)).toBeNull();
    expect(stockHealthSkipReason(items[2], none, 0)).toBeNull();
  });
});
