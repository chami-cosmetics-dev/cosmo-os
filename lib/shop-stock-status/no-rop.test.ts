import { describe, expect, it } from "vitest";

import { summarizeShopStockLocation } from "@/lib/shop-stock-status/calc";
import {
  ONLINE_STOCK_COLUMNS,
  SHOP_STOCK_COLUMNS,
  type ShopStockCell,
  type ShopStockColumn,
  type ShopStockRow,
} from "@/lib/shop-stock-status/config";
import {
  applyNoRopFilters,
  buildNoRopRows,
  DEFAULT_NO_ROP_FILTERS,
  NO_ROP_CHANNEL_COLUMNS,
  NO_ROP_CHANNELS,
  noRopFiltersActive,
  noRopFilterText,
  readNoRopRows,
  type NoRopFilters,
} from "@/lib/shop-stock-status/no-rop";
import type { StockHealthStatus } from "@/lib/stock-health/config";

const SHOP_KEYS = SHOP_STOCK_COLUMNS.map((c) => c.key);
const ONLINE_KEYS = ONLINE_STOCK_COLUMNS.map((c) => c.key);
const PRIORITIES: StockHealthStatus[] = ["Top", "Newly Added", "Low", "Discontinue"];

/** Cells from [stock, rop] per column (missing columns = no stock, no ROP). */
function shopRow(
  sku: string,
  priority: StockHealthStatus,
  pairs: Record<string, [number, number]>,
  keys: string[] = SHOP_KEYS,
): ShopStockRow {
  const cells: Record<string, ShopStockCell> = {};
  for (const key of keys) {
    const [stock, rop] = pairs[key] ?? [0, 0];
    cells[key] = { stock, rop, percent: rop > 0 ? (stock / rop) * 100 : null };
  }
  return { commonSku: sku, itemName: `Item ${sku}`, priority, cells, fail: 0, pass: 0 };
}

const filters = (patch: Partial<NoRopFilters>): NoRopFilters => ({ ...DEFAULT_NO_ROP_FILTERS, ...patch });

/** A deterministic mix: every column gets ROP+stock, no ROP+stock, no ROP+0, no ROP+negative. */
function fixture(keys: string[]): ShopStockRow[] {
  const rows: ShopStockRow[] = [];
  for (let n = 0; n < 80; n += 1) {
    const pairs: Record<string, [number, number]> = {};
    keys.forEach((key, i) => {
      const kind = (n * 3 + i * 7) % 5;
      pairs[key] = kind === 0 ? [n + 1, 10] : kind === 1 ? [n + i + 1, 0] : kind === 2 ? [0, 0] : kind === 3 ? [-2, 0] : [0, 5];
    });
    rows.push(shopRow(`S${String(n).padStart(3, "0")}`, PRIORITIES[n % 4], pairs, keys));
  }
  return rows;
}

const SOURCE_KEYS = { shops: SHOP_KEYS, online: ONLINE_KEYS };

describe.each(NO_ROP_CHANNELS)("NO ROP (%s) matches the 'No ROP - With Stock' counts", (channel) => {
  const columns: ShopStockColumn[] = NO_ROP_CHANNEL_COLUMNS[channel];
  const KEYS = columns.map((c) => c.key);
  const shops = fixture(SOURCE_KEYS[channel]);
  const noRop = buildNoRopRows(shops, columns);

  it("Location = X lists exactly that location's No ROP - With Stock count (each priority too)", () => {
    for (const key of KEYS) {
      expect(applyNoRopFilters(noRop, filters({ location: key })), key).toHaveLength(
        summarizeShopStockLocation(shops, key).noRopWithStock,
      );
      for (const priority of PRIORITIES) {
        const sub = shops.filter((r) => r.priority === priority);
        expect(applyNoRopFilters(noRop, filters({ location: key, priority }))).toHaveLength(
          summarizeShopStockLocation(sub, key).noRopWithStock,
        );
      }
    }
  });

  it("only items qualifying somewhere; '-' for ROP / 0 / negative; Total = shown cells", () => {
    for (const row of noRop) {
      const src = shops.find((r) => r.commonSku === row.commonSku)!;
      let total = 0;
      for (const key of KEYS) {
        const c = src.cells[key];
        expect(row.cells[key]).toBe(c.percent === null && c.stock > 0 ? c.stock : null);
        total += row.cells[key] ?? 0;
      }
      expect(row.total).toBe(total);
      expect(total).toBeGreaterThan(0);
    }
    const qualifying = shops.filter((r) => KEYS.some((k) => r.cells[k].percent === null && r.cells[k].stock > 0));
    expect(noRop).toHaveLength(qualifying.length);
  });
});

describe("Shops view leaves out the combined Online column", () => {
  it("not a column, not in the Total, and Online-only items are not listed", () => {
    const rows = buildNoRopRows(
      [shopRow("A", "Top", { ogf: [5, 0], online: [100, 0] }), shopRow("B", "Top", { online: [7, 0] })],
      NO_ROP_CHANNEL_COLUMNS.shops,
    );
    expect(NO_ROP_CHANNEL_COLUMNS.shops.map((c) => c.key)).not.toContain("online");
    expect(rows.map((r) => r.commonSku)).toEqual(["A"]);
    expect(rows[0].total).toBe(5);
    expect(rows[0].cells).not.toHaveProperty("online");
  });

  it("Online channels view uses the Online tab's companies", () => {
    expect(NO_ROP_CHANNEL_COLUMNS.online.map((c) => c.label)).toEqual([
      "Cosmetics.lk", "Chami", "KAD", "SPK", "Pevi", "Udara", "USP",
    ]);
    const rows = buildNoRopRows(
      [shopRow("X", "Low", { cosmo: [12, 0], chami: [3, 5], usp: [4, 0] }, ONLINE_KEYS)],
      NO_ROP_CHANNEL_COLUMNS.online,
    );
    expect(rows[0].cells).toMatchObject({ cosmo: 12, chami: null, usp: 4 });
    expect(rows[0].total).toBe(16);
  });
});

describe("applyNoRopFilters", () => {
  const rows = buildNoRopRows([
    shopRow("A", "Top", { ogf: [5, 0], negombo: [20, 0] }), // total 25
    shopRow("B", "Low", { ogf: [30, 0] }), // total 30
    shopRow("C", "Top", { galle: [3, 0], ogf: [9, 10] }), // total 3, OGF has ROP
    shopRow("D", "Discontinue", { ogf: [5, 0] }), // total 5
    shopRow("E", "Top", { ogf: [0, 10] }), // never qualifies
  ]);
  const skus = (f: Partial<NoRopFilters>) => applyNoRopFilters(rows, filters(f)).map((r) => r.commonSku);

  it("drops items with no qualifying location", () => {
    expect(rows.map((r) => r.commonSku)).toEqual(["A", "B", "C", "D"]);
  });

  it("sorts by Total (Location All) lowest first by default; ties keep SKU order", () => {
    expect(skus({})).toEqual(["C", "D", "A", "B"]);
    expect(skus({ sort: "desc" })).toEqual(["B", "A", "D", "C"]);
  });

  it("with a location: only items qualifying there, sorted by that location's stock", () => {
    expect(skus({ location: "ogf" })).toEqual(["A", "D", "B"]);
    expect(skus({ location: "ogf", sort: "desc" })).toEqual(["B", "A", "D"]);
  });

  it("Stock quantity checks Total (All) or the location; Below/Above are strict; empty = off", () => {
    expect(skus({ stockOp: "below", stockValue: "25" })).toEqual(["C", "D"]);
    expect(skus({ stockOp: "above", stockValue: "25" })).toEqual(["B"]);
    expect(skus({ stockOp: "equal", stockValue: "25" })).toEqual(["A"]);
    expect(skus({ location: "ogf", stockOp: "equal", stockValue: "5" })).toEqual(["A", "D"]);
    expect(skus({ location: "ogf", stockOp: "above", stockValue: "5" })).toEqual(["B"]);
    expect(skus({ stockOp: "below", stockValue: "" })).toHaveLength(4);
    expect(skus({ stockOp: "off", stockValue: "1" })).toHaveLength(4);
  });

  it("search and priority", () => {
    expect(skus({ search: "item b" })).toEqual(["B"]);
    expect(skus({ priority: "Top" })).toEqual(["C", "A"]);
  });

  it("Clear shows for any change, sort included; filter text names the view", () => {
    expect(noRopFiltersActive(DEFAULT_NO_ROP_FILTERS)).toBe(false);
    expect(noRopFiltersActive(filters({ sort: "desc" }))).toBe(true);
    expect(noRopFilterText(filters({ priority: "Top", location: "ogf", stockOp: "below", stockValue: "10" }))).toBe(
      "View = Shops · Priority = Top · Location = OGF · Stock quantity = Below 10 · Sort by stock = Lowest to highest",
    );
    expect(noRopFilterText(filters({ location: "cosmo" }), "online")).toBe(
      "View = Online channels · Location = Cosmetics.lk · Sort by stock = Lowest to highest",
    );
  });

  it("export re-reads the rows the page sends", () => {
    const shown = applyNoRopFilters(rows, filters({ location: "ogf" }));
    expect(readNoRopRows(JSON.parse(JSON.stringify(shown)))).toEqual(shown);
    expect(readNoRopRows("nope")).toBeNull();
  });
});

describe("buildNoRopWorkbook", () => {
  it.each([
    ["shops", SHOP_KEYS, { ogf: [5, 0], negombo: [20, 0] }, "shops"],
    ["online", ONLINE_KEYS, { cosmo: [5, 0], usp: [20, 0] }, "online-channels"],
  ] as const)("%s: rows in order with '-' and Total", { timeout: 30_000 }, async (channel, keys, pairs, slug) => {
    const ExcelJS = (await import("exceljs")).default;
    const { buildNoRopWorkbook, NO_ROP_HEADER_ROW } = await import("@/lib/shop-stock-status/no-rop-workbook");
    const columns = NO_ROP_CHANNEL_COLUMNS[channel];
    const rows = buildNoRopRows(
      [shopRow("A", "Top", pairs as unknown as Record<string, [number, number]>, [...keys])],
      columns,
    );
    const { fileName, buffer } = await buildNoRopWorkbook(rows, "x", new Date("2026-11-17T05:00:00Z"), channel);
    expect(fileName).toMatch(new RegExp(`^shop-stock-status-no-rop-${slug}-filtered-.*\\.xlsx$`));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("NO ROP")!;
    const head = ws.getRow(NO_ROP_HEADER_ROW).values as unknown[];
    expect(head.slice(1)).toEqual(["Common SKU", "Item name", "Priority", ...columns.map((c) => c.label), "Total"]);
    const first = ws.getRow(NO_ROP_HEADER_ROW + 1).values as unknown[];
    expect(first[1]).toBe("A");
    expect(first[4]).toBe(5);
    expect(first[5]).toBe("-");
    expect(first[4 + columns.length]).toBe(25);
    expect(String(ws.getCell(4, 1).value)).toContain("1 items · Filters: x");
  });
});

describe("main Export (SHOP + ONLINE) file (also the Monday mail attachment)", () => {
  it("SHOP, ONLINE, then NO ROP - SHOP and NO ROP - ONLINE with every qualifying item", { timeout: 30_000 }, async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { NO_ROP_HEADER_ROW } = await import("@/lib/shop-stock-status/no-rop-workbook");
    const { buildShopStockStatusWorkbook } = await import("@/lib/shop-stock-status/workbook");
    const shops = fixture(SHOP_KEYS);
    const online = fixture(ONLINE_KEYS);
    const { fileName, buffer } = await buildShopStockStatusWorkbook({
      tabs: { shops, online },
      fetchedAt: "2026-11-18T03:19:27.000Z",
    });
    expect(fileName).toMatch(/^shop-stock-status-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.xlsx$/);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["SHOP", "ONLINE", "NO ROP - SHOP", "NO ROP - ONLINE"]);

    for (const [sheet, channel, source] of [["NO ROP - SHOP", "shops", shops], ["NO ROP - ONLINE", "online", online]] as const) {
      const ws = wb.getWorksheet(sheet)!;
      const columns = NO_ROP_CHANNEL_COLUMNS[channel];
      const expected = applyNoRopFilters(buildNoRopRows(source, columns), DEFAULT_NO_ROP_FILTERS);
      expect(expected.length).toBeGreaterThan(0);
      const head = ws.getRow(NO_ROP_HEADER_ROW).values as unknown[];
      expect(head.slice(1)).toEqual(["Common SKU", "Item name", "Priority", ...columns.map((c) => c.label), "Total"]);
      const skus: unknown[] = [];
      for (let r = NO_ROP_HEADER_ROW + 1; r <= ws.rowCount; r += 1) skus.push(ws.getCell(r, 1).value);
      expect(skus).toEqual(expected.map((row) => row.commonSku));
      expect(String(ws.getCell(4, 1).value)).toBe(`${expected.length} items · Filters: None (all items)`);
      expect(String(ws.getCell(3, 1).value)).toContain("2026-11-18 08:49:27");
    }
  });
});
