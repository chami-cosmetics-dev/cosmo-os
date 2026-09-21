import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  buildStockPriceMissingWorkbook,
  stockPriceMissingExcelFileName,
} from "@/lib/stock-price-missing/workbook";

describe("buildStockPriceMissingWorkbook", () => {
  it("writes two sheets", () => {
    const buffer = buildStockPriceMissingWorkbook({
      companyId: "c1",
      rows: [
        {
          sku: "A-1",
          itemName: "Item A",
          locations: [{ locationLabel: "Online", stock: 2 }],
          totalStock: 2,
          standardRate: null,
          ogfRate: null,
          gap: "Both",
        },
      ],
      erp2OgfMissingRows: [
        {
          sku: "B-2",
          itemName: "Item B",
          locations: [{ locationLabel: "LWK", stock: 5 }],
          totalStock: 5,
          standardRate: "900.00",
          ogfRate: null,
          gap: "OGF",
        },
      ],
      missingStandardCount: 0,
      missingOgfCount: 1,
      missingBothCount: 1,
      erp2OgfMissingCount: 1,
    });

    const wb = XLSX.read(buffer, { type: "buffer" });
    expect(wb.SheetNames).toEqual(["No selling price", "ERP2 OGF missing"]);
    const sheet2 = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets["ERP2 OGF missing"]!,
    );
    expect(sheet2[0]?.SKU).toBe("B-2");
    expect(sheet2[0]?.["Standard Selling"]).toBe("900.00");
  });

  it("builds safe file name", () => {
    expect(stockPriceMissingExcelFileName("Sep 21, 2026")).toBe(
      "selling-price-gaps-Sep-21-2026.xlsx",
    );
  });
});
