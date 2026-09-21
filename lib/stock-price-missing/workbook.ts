import * as XLSX from "xlsx";

import { formatLocationsCell } from "@/lib/stock-price-missing/build-content";
import type { StockPriceMissingScanSummary } from "@/lib/stock-price-missing/build-content";

function sheetFromRows(
  rows: StockPriceMissingScanSummary["rows"],
  options: { includeStandardRate: boolean },
) {
  const header = [
    "#",
    "SKU",
    "Item name",
    "Locations (stock)",
    "Total stock",
    "Standard Selling",
    "OGF",
  ];
  const data = rows.map((row, index) => [
    index + 1,
    row.sku,
    row.itemName,
    formatLocationsCell(row.locations),
    row.totalStock,
    options.includeStandardRate ? (row.standardRate ?? "Missing") : "Missing",
    "Missing",
  ]);
  return XLSX.utils.aoa_to_sheet([header, ...data]);
}

/** Two-sheet workbook: no selling price + ERP2 OGF missing. */
export function buildStockPriceMissingWorkbook(
  scan: StockPriceMissingScanSummary,
): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(scan.rows, { includeStandardRate: false }),
    "No selling price",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(scan.erp2OgfMissingRows, { includeStandardRate: true }),
    "ERP2 OGF missing",
  );
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function stockPriceMissingExcelFileName(reportDateLabel: string): string {
  const safe = reportDateLabel.replace(/[^\dA-Za-z]+/g, "-").replace(/^-|-$/g, "");
  return `selling-price-gaps-${safe || "report"}.xlsx`;
}
