import { describe, expect, it } from "vitest";

import {
  buildCommonSkuRows,
  buildRopRows,
  parseExcludedSkus,
  skuKey,
  summarizeRopStatus,
  type StockHealthItem,
} from "@/lib/stock-health/calc";
import {
  applyRopDetailsFilters,
  buildRopDetailsRows,
  DEFAULT_ROP_DETAILS_FILTERS,
  parseRopDetailsFilters,
  ROP_DETAILS_STATUSES,
  ropDetailsFiltersActive,
  ropDetailsFilterText,
  type RopDetailsFilters,
  type StockHealthRopDetailsRow,
} from "@/lib/stock-health/rop-details";

const PRIORITIES = ["Top", "Newly Added", "Low", "Discontinue"];

/** A mixed set: every priority × every ROP group, plus an excluded SKU and a website draft. */
function fixture() {
  const items: StockHealthItem[] = [];
  const stock = new Map<string, number>();
  const rop = new Map<string, number>();
  let n = 0;
  for (const priority of PRIORITIES) {
    // [stock, rop]: pass, fail, fail at exactly 50%, no ROP with stock, no ROP no stock, negative stock
    for (const [s, r] of [[80, 100], [20, 100], [50, 100], [5, 0], [0, 0], [-3, 10]] as const) {
      const sku = `S${String(n++).padStart(3, "0")}`;
      items.push({ sku, brand: "Golden Rose", priority, siteStatus: "active", itemName: `Item ${sku}` });
      stock.set(skuKey(sku), s);
      if (r) rop.set(skuKey(sku), r);
    }
  }
  items.push({ sku: "EXCL1", brand: "Golden Rose", priority: "Top", siteStatus: "active", itemName: "x" });
  stock.set(skuKey("EXCL1"), 10);
  items.push({ sku: "DRAFT1", brand: "Golden Rose", priority: "Top", siteStatus: "draft", itemName: "y" });
  const excluded = parseExcludedSkus(["EXCL1"]);
  return buildRopRows(buildCommonSkuRows(items, stock, excluded), rop);
}

const filters = (patch: Partial<RopDetailsFilters>): RopDetailsFilters => ({
  ...DEFAULT_ROP_DETAILS_FILTERS,
  ...patch,
});

describe("ROP Details matches the ROP Status table", () => {
  const ropRows = fixture();
  const details = buildRopDetailsRows(ropRows);
  const { rows, grandTotal } = summarizeRopStatus(ropRows);

  it("every clickable number lists exactly that many items", () => {
    for (const row of rows) {
      for (const group of ROP_DETAILS_STATUSES) {
        const shown = applyRopDetailsFilters(details, filters({ priority: row.status, status: group }));
        expect(shown, `${row.status} + ${group}`).toHaveLength(row[group]);
      }
      expect(applyRopDetailsFilters(details, filters({ priority: row.status }))).toHaveLength(row.total);
    }
    for (const group of ROP_DETAILS_STATUSES) {
      expect(applyRopDetailsFilters(details, filters({ status: group }))).toHaveLength(grandTotal[group]);
    }
    expect(applyRopDetailsFilters(details, DEFAULT_ROP_DETAILS_FILTERS)).toHaveLength(grandTotal.total);
  });

  it("leaves out the excluded SKU and the website draft with no stock", () => {
    const skus = details.map((r) => r.commonSku);
    expect(skus).not.toContain("EXCL1");
    expect(skus).not.toContain("DRAFT1");
  });

  it("uses the same PASS / FAIL rule (exactly 50% is FAIL)", () => {
    const atHalf = details.find((r) => r.percent === 50)!;
    expect(atHalf.status).toBe("fail");
  });

  it("has no % when there is no ROP", () => {
    for (const row of details.filter((r) => r.status === "noRopWithStock" || r.status === "noRopNoStock")) {
      expect(row.percent).toBeNull();
    }
  });
});

describe("applyRopDetailsFilters", () => {
  const row = (commonSku: string, percent: number | null): StockHealthRopDetailsRow => ({
    commonSku,
    itemName: null,
    priority: "Top",
    status: percent == null ? "noRopWithStock" : percent > 50 ? "pass" : "fail",
    stock: 0,
    rop: percent == null ? 0 : 100,
    percent,
  });
  const rows = [row("A", 80), row("B", null), row("C", 10), row("D", 45.5), row("E", null)];

  it("sorts lowest to highest by default, '-' last", () => {
    expect(applyRopDetailsFilters(rows, DEFAULT_ROP_DETAILS_FILTERS).map((r) => r.commonSku)).toEqual([
      "C", "D", "A", "B", "E",
    ]);
  });

  it("sorts highest to lowest, '-' still last", () => {
    expect(applyRopDetailsFilters(rows, filters({ sort: "desc" })).map((r) => r.commonSku)).toEqual([
      "A", "D", "C", "B", "E",
    ]);
  });

  it("Percentage works like Shop Stock Status and ignores '-'", () => {
    expect(applyRopDetailsFilters(rows, filters({ percentOp: "below", percentValue: "50" })).map((r) => r.commonSku)).toEqual(["C", "D"]);
    expect(applyRopDetailsFilters(rows, filters({ percentOp: "above", percentValue: "80" }))).toHaveLength(0);
    expect(applyRopDetailsFilters(rows, filters({ percentOp: "equal", percentValue: "45.5" })).map((r) => r.commonSku)).toEqual(["D"]);
    // Empty number box = filter does nothing
    expect(applyRopDetailsFilters(rows, filters({ percentOp: "below", percentValue: "" }))).toHaveLength(5);
  });

  it("does not change the input order", () => {
    const copy = [...rows];
    applyRopDetailsFilters(rows, filters({ sort: "desc" }));
    expect(rows).toEqual(copy);
  });
});

describe("filter helpers", () => {
  it("Clear shows when anything differs from the defaults, sort included", () => {
    expect(ropDetailsFiltersActive(DEFAULT_ROP_DETAILS_FILTERS)).toBe(false);
    expect(ropDetailsFiltersActive(filters({ sort: "desc" }))).toBe(true);
    expect(ropDetailsFiltersActive(filters({ percentValue: "5" }))).toBe(true);
  });

  it("parses export filters, defaulting anything unknown", () => {
    expect(parseRopDetailsFilters({ priority: "Top", status: "fail", percentOp: "below", percentValue: "25", sort: "desc" })).toEqual({
      priority: "Top", status: "fail", percentOp: "below", percentValue: "25", sort: "desc",
    });
    expect(parseRopDetailsFilters({ priority: "Nope", status: 5, sort: "sideways" })).toEqual(DEFAULT_ROP_DETAILS_FILTERS);
    expect(parseRopDetailsFilters(null)).toEqual(DEFAULT_ROP_DETAILS_FILTERS);
  });

  it("describes the filters", () => {
    expect(ropDetailsFilterText(filters({ priority: "Top", status: "fail", percentOp: "below", percentValue: "25" }))).toBe(
      "Priority = Top · Status = Fail · Percentage = Below 25% · Sort by % = Lowest to highest",
    );
  });
});

describe("buildRopDetailsWorkbook", () => {
  // Loads the Excel code; can pass 5s when the whole suite runs in parallel.
  it("writes the filtered rows in order, % as a percentage and '-' as blank", { timeout: 30_000 }, async () => {
    const XLSX = await import("xlsx-js-style");
    const { buildRopDetailsWorkbook } = await import("@/lib/stock-health/export-workbooks");
    const details = buildRopDetailsRows(fixture());
    const shown = applyRopDetailsFilters(details, filters({ priority: "Top" }));
    const { fileName, buffer } = buildRopDetailsWorkbook(shown, "Priority = Top", new Date("2026-11-17T05:00:00Z"));

    expect(fileName).toBe("stock-health-rop-details-2026-11-17.xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["ROP Details"]);
    const sheet = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["ROP Details"], { header: 1, raw: true });
    expect(sheet[0]).toEqual(["Common SKU", "Item name", "Priority Status", "Status", "Stock", "ROP", "Stock % of ROP"]);
    const body = sheet.slice(1, 1 + shown.length);
    expect(body.map((r) => r[0])).toEqual(shown.map((r) => r.commonSku));
    expect(body[0][6]).toBe(shown[0].percent! / 100);
    expect(body[body.length - 1][6] ?? null).toBeNull();
    expect(sheet.some((r) => String(r[0] ?? "").startsWith(`${shown.length} Common SKUs · Priority = Top`))).toBe(true);
  });
});
