import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { parseSalesHistorySheet } from "@/lib/vault-osf/sales-history-import";

function xlsxBuffer(aoa: (string | number | null)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

const columns = [
  { key: "sv", label: "SV" },
  { key: "ori", label: "ORI" },
  { key: "ae", label: "AE" },
];

describe("vault OSF sales history import", () => {
  it("parses qty cells; blank is skip; duplicate SKU errors", () => {
    const buf = xlsxBuffer([
      ["SKU", "Barcode", "SV", "ORI", "AE"],
      ["NW004-2", "1", 12, "", 1],
      ["NW004-2", "1", 0, 0, 0],
    ]);
    const parsed = parseSalesHistorySheet(buf, "h.xlsx", columns);
    const dup = parsed.errors.find((e) => e.message.toLowerCase().includes("duplicate"));
    expect(dup).toBeTruthy();
  });

  it("accepts keys as headers and records non-blank qty", () => {
    const buf = xlsxBuffer([
      ["Variant SKU", "sv", "ori", "ae"],
      ["BV001-1", 11, 14, 1],
    ]);
    const parsed = parseSalesHistorySheet(buf, "h.xlsx", columns);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.sku).toBe("BV001-1");
    expect(parsed.rows[0]!.cells.map((c) => c.qty)).toEqual([11, 14, 1]);
  });
});
