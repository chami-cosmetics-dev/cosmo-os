import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  buildRopHeaderToKeyMap,
  buildRopTemplateAoa,
  erp1TotalRop,
  ERP_01_TOTAL_ROP_HEADER,
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

  it("maps 2026-09-25 Cosmo ROP aliases and skips ERP 01 Total ROP", () => {
    const buf = sheetBuffer([
      [
        "SKU",
        "Barcode",
        "ERP 01 Total ROP",
        "Cosmetics.lk Main Warehouse",
        "Chami Main Warehouse -Online",
        "Chami ShopWarehouse GCC",
        "DTD",
      ],
      ["AAA_1", "111", 99, 6, 4, 2, 8],
    ]);
    const parsed = parseRopImportSheet(buf, "OSF-ROP-template.xlsx", [
      { key: "cosmetics_lk", label: "Cosmetics.lk" },
      { key: "chami", label: "Chami" },
      { key: "chami_shop_gcc", label: "Chami ShopWarehouse GCC" },
      { key: "thewan", label: "Thewan / DTD" },
    ]);
    expect(parsed.unknownHeaders).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.cells).toEqual([
      { columnKey: "cosmetics_lk", columnLabel: "Cosmetics.lk", qty: 6 },
      { columnKey: "chami", columnLabel: "Chami", qty: 4 },
      { columnKey: "chami_shop_gcc", columnLabel: "Chami ShopWarehouse GCC", qty: 2 },
      { columnKey: "thewan", columnLabel: "Thewan / DTD", qty: 8 },
    ]);
  });
});

describe("erp1TotalRop", () => {
  it("sums Cosmetics.lk Main + ERP1 shops and ignores trading", () => {
    expect(
      erp1TotalRop(
        { cosmetics_lk: 6, cosmo_shop_gcc: 2, cosmo_shop_negombo: 0, chami: 4, thewan: 8 },
        ["cosmetics_lk", "cosmo_shop_gcc", "cosmo_shop_negombo"],
      ),
    ).toBe(8);
  });

  it("returns null when every ERP1 cell is empty", () => {
    expect(erp1TotalRop({ chami: 4 }, ["cosmetics_lk", "cosmo_shop_gcc"])).toBeNull();
  });
});

describe("buildRopTemplateAoa", () => {
  it("inserts ERP 01 Total ROP after Barcode", () => {
    const aoa = buildRopTemplateAoa({
      ropColumns: [
        { key: "cosmetics_lk", label: "Cosmetics.lk Main Warehouse" },
        { key: "cosmo_shop_gcc", label: "GCC Shop" },
        { key: "chami", label: "Chami Main Warehouse -Online" },
      ],
      erp1TotalKeys: ["cosmetics_lk", "cosmo_shop_gcc"],
      rows: [
        {
          sku: "AAA_1",
          barcode: "111",
          rops: { cosmetics_lk: 6, cosmo_shop_gcc: 2, chami: 4 },
        },
      ],
    });
    expect(aoa[0]).toEqual([
      "SKU",
      "Barcode",
      ERP_01_TOTAL_ROP_HEADER,
      "Cosmetics.lk Main Warehouse",
      "GCC Shop",
      "Chami Main Warehouse -Online",
    ]);
    expect(aoa[1]).toEqual(["AAA_1", "111", 8, 6, 2, 4]);
  });

  it("omits ERP 01 Total ROP when no ERP1 keys (Vault)", () => {
    const aoa = buildRopTemplateAoa({
      ropColumns: [{ key: "sv", label: "SV" }],
      rows: [{ sku: "X", barcode: null, rops: { sv: 3 } }],
    });
    expect(aoa[0]).toEqual(["SKU", "Barcode", "SV"]);
    expect(aoa[1]).toEqual(["X", "", 3]);
  });
});
