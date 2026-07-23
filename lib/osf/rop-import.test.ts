import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  buildRopHeaderToKeyMap,
  parseRopImportSheet,
  parseRopQtyCell,
} from "@/lib/osf/rop-import";

function sheetBuffer(aoa: (string | number | null)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, "ROP");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const cols = [
  { key: "lmj", label: "LMJ" },
  { key: "cosmo_shop_gcc", label: "GCC Shop" },
];

describe("parseRopQtyCell", () => {
  it("treats blank as no change", () => {
    expect(parseRopQtyCell("")).toEqual({ ok: true, blank: true });
    expect(parseRopQtyCell(null)).toEqual({ ok: true, blank: true });
  });

  it("accepts non-negative integers", () => {
    expect(parseRopQtyCell(12)).toEqual({ ok: true, value: 12 });
  });

  it("rejects negatives", () => {
    expect(parseRopQtyCell(-1).ok).toBe(false);
  });
});

describe("parseRopImportSheet", () => {
  it("skips blank cells and applies filled ones", () => {
    const buf = sheetBuffer([
      ["SKU", "Barcode", "LMJ", "GCC Shop"],
      ["AAA_1", "111", 10, ""],
      ["BBB_1", "222", "", 5],
    ]);
    const parsed = parseRopImportSheet(buf, "t.xlsx", cols);
    expect(parsed.skippedBlank).toBe(2);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]!.cells).toEqual([
      { columnKey: "lmj", columnLabel: "LMJ", qty: 10 },
    ]);
    expect(parsed.rows[1]!.cells).toEqual([
      { columnKey: "cosmo_shop_gcc", columnLabel: "GCC Shop", qty: 5 },
    ]);
  });

  it("rejects duplicate SKU rows", () => {
    const buf = sheetBuffer([
      ["SKU", "LMJ"],
      ["AAA_1", 1],
      ["AAA_1", 2],
    ]);
    const parsed = parseRopImportSheet(buf, "t.xlsx", cols);
    expect(parsed.rows.every((r) => r.sku.toLowerCase() !== "aaa_1" || r.cells.length >= 0)).toBe(
      true,
    );
    // First occurrence kept until duplicate flag — duplicates excluded from rows
    expect(parsed.rows.filter((r) => r.sku === "AAA_1")).toHaveLength(0);
    expect(parsed.errors.some((e) => e.message.includes("Duplicate"))).toBe(true);
  });

  it("maps headers via buildRopHeaderToKeyMap", () => {
    const map = buildRopHeaderToKeyMap(cols);
    expect(map.get("lmj")).toBe("lmj");
    expect(map.get("gcc shop")).toBe("cosmo_shop_gcc");
  });
});
