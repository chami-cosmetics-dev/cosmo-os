import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { ShopStockColumn, ShopStockRow } from "@/lib/shop-stock-status/config";
import { addLocationSheet, FIRST_DATA_ROW, HEADER_ROW } from "@/lib/shop-stock-status/workbook";

const columns: ShopStockColumn[] = [
  { key: "a", label: "OGF", warehouses: [], ropColumnKeys: [] },
  { key: "b", label: "Galle", warehouses: [], ropColumnKeys: [] },
];
const rows: ShopStockRow[] = [
  {
    commonSku: "ABC",
    itemName: "Item ABC",
    priority: "Top",
    cells: {
      a: { stock: 5, rop: 10, percent: 50 },
      b: { stock: 3, rop: 0, percent: null },
    },
    fail: 0,
    pass: 1,
  },
];

describe("addLocationSheet", () => {
  it("writes frozen headers + Common SKU column, times, and location headings", async () => {
    const wb = new ExcelJS.Workbook();
    addLocationSheet(wb, "SHOP", rows, columns, { downloadedAt: "2026-11-10 13:11:58", stockAsOf: "2026-11-10 12:41:50" });

    // Read the written file back, so the frozen pane is really in the .xlsx.
    const read = new ExcelJS.Workbook();
    await read.xlsx.load(await wb.xlsx.writeBuffer());
    const ws = read.getWorksheet("SHOP")!;

    expect(ws.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: HEADER_ROW + 1 });
    expect(ws.getCell(2, 1).value).toBe("Downloaded: 2026-11-10 13:11:58");
    expect(ws.getCell(3, 1).value).toContain("2026-11-10 12:41:50");
    expect(ws.getCell(HEADER_ROW, 4).value).toBe("OGF");
    expect(ws.getCell(HEADER_ROW, 7).value).toBe("Galle");
    expect(ws.getCell(HEADER_ROW + 1, 6).value).toBe("%");
    expect(ws.getCell(FIRST_DATA_ROW, 6).value).toBe(0.5);
    expect(ws.getCell(FIRST_DATA_ROW, 9).value).toBe("-");
    expect(ws.getCell(FIRST_DATA_ROW, 12).value).toBe("Fail: 0 | Pass: 1");
  });
});
