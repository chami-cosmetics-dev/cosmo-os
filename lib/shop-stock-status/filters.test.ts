import { describe, expect, it } from "vitest";

import type { ShopStockCell, ShopStockRow } from "@/lib/shop-stock-status/config";
import {
  parseShopStockPercentFilter,
  shopStockCellMatches,
  shopStockColourLabel,
  shopStockPercentFilterLabel,
  shopStockRowMatchesCells,
} from "@/lib/shop-stock-status/filters";

const cell = (percent: number | null): ShopStockCell => ({ stock: 0, rop: percent == null ? 0 : 10, percent });

function row(cells: Record<string, number | null>): ShopStockRow {
  return {
    commonSku: "SKU",
    itemName: null,
    priority: "Top",
    cells: Object.fromEntries(Object.entries(cells).map(([k, p]) => [k, cell(p)])),
  } as unknown as ShopStockRow;
}

const KEYS = ["ogf", "cool", "kiri"];

describe("parseShopStockPercentFilter", () => {
  it("is off when Off or the number box is empty / invalid", () => {
    expect(parseShopStockPercentFilter("off", "25")).toBeNull();
    expect(parseShopStockPercentFilter("below", "")).toBeNull();
    expect(parseShopStockPercentFilter("below", "   ")).toBeNull();
    expect(parseShopStockPercentFilter("below", "abc")).toBeNull();
  });
  it("reads the number", () => {
    expect(parseShopStockPercentFilter("below", "25")).toEqual({ op: "below", value: 25 });
    expect(parseShopStockPercentFilter("equal", " 12.5 ")).toEqual({ op: "equal", value: 12.5 });
  });
});

describe("shopStockCellMatches", () => {
  it("Zero stock matches exactly 0% only, never '-'", () => {
    expect(shopStockCellMatches(cell(0), "zero", null)).toBe(true);
    expect(shopStockCellMatches(cell(0.4), "zero", null)).toBe(false);
    expect(shopStockCellMatches(cell(null), "zero", null)).toBe(false);
    expect(shopStockCellMatches(undefined, "zero", null)).toBe(false);
  });
  it("Below / Above are strict, Equal to matches the shown (1 decimal) value", () => {
    const below = parseShopStockPercentFilter("below", "25");
    expect(shopStockCellMatches(cell(24.9), "all", below)).toBe(true);
    expect(shopStockCellMatches(cell(25), "all", below)).toBe(false);
    const above = parseShopStockPercentFilter("above", "25");
    expect(shopStockCellMatches(cell(25.1), "all", above)).toBe(true);
    expect(shopStockCellMatches(cell(25), "all", above)).toBe(false);
    const equal = parseShopStockPercentFilter("equal", "25");
    expect(shopStockCellMatches(cell(25.04), "all", equal)).toBe(true);
    expect(shopStockCellMatches(cell(25.2), "all", equal)).toBe(false);
  });
  it("ignores '-' cells for Percentage", () => {
    expect(shopStockCellMatches(cell(null), "all", parseShopStockPercentFilter("below", "25"))).toBe(false);
  });
  it("Colour + Percentage must both hold on the cell", () => {
    const below25 = parseShopStockPercentFilter("below", "25");
    expect(shopStockCellMatches(cell(10), "fail", below25)).toBe(true);
    expect(shopStockCellMatches(cell(40), "fail", below25)).toBe(false);
    expect(shopStockCellMatches(cell(0), "zero", below25)).toBe(true);
  });
});

describe("shopStockRowMatchesCells", () => {
  const r = row({ ogf: 0, cool: 80, kiri: null });

  it("Location = one shop checks only that shop", () => {
    expect(shopStockRowMatchesCells(r, KEYS, "ogf", "zero", null)).toBe(true);
    expect(shopStockRowMatchesCells(r, KEYS, "cool", "zero", null)).toBe(false);
    expect(shopStockRowMatchesCells(r, KEYS, "kiri", "zero", null)).toBe(false);
    expect(shopStockRowMatchesCells(r, KEYS, "cool", "all", parseShopStockPercentFilter("above", "50"))).toBe(true);
    expect(shopStockRowMatchesCells(r, KEYS, "ogf", "all", parseShopStockPercentFilter("above", "50"))).toBe(false);
  });

  it("Location = All matches when any column matches (same as Colour)", () => {
    expect(shopStockRowMatchesCells(r, KEYS, "all", "zero", null)).toBe(true);
    expect(shopStockRowMatchesCells(r, KEYS, "all", "all", parseShopStockPercentFilter("above", "50"))).toBe(true);
    expect(shopStockRowMatchesCells(r, KEYS, "all", "all", parseShopStockPercentFilter("above", "90"))).toBe(false);
  });

  it("keeps the existing Location-only and Colour behaviour", () => {
    expect(shopStockRowMatchesCells(r, KEYS, "all", "all", null)).toBe(true);
    expect(shopStockRowMatchesCells(r, KEYS, "kiri", "all", null)).toBe(false);
    expect(shopStockRowMatchesCells(r, KEYS, "cool", "all", null)).toBe(true);
    expect(shopStockRowMatchesCells(r, KEYS, "all", "pass", null)).toBe(true);
    expect(shopStockRowMatchesCells(r, KEYS, "ogf", "pass", null)).toBe(false);
  });

  it("an empty number box does nothing", () => {
    expect(shopStockRowMatchesCells(r, KEYS, "kiri", "all", parseShopStockPercentFilter("below", ""))).toBe(false);
    expect(shopStockRowMatchesCells(r, KEYS, "all", "all", parseShopStockPercentFilter("below", ""))).toBe(true);
  });
});

describe("labels", () => {
  it("describes the filters for the summary / filtered export", () => {
    expect(shopStockColourLabel("zero")).toBe("Zero stock · 0%");
    expect(shopStockPercentFilterLabel({ op: "below", value: 25 })).toBe("Below 25%");
    expect(shopStockPercentFilterLabel({ op: "equal", value: 0 })).toBe("Equal to 0%");
  });
});
