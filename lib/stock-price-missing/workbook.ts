import * as XLSX from "xlsx";

import { formatLocationsCell } from "@/lib/stock-price-missing/build-content";
import type {
  StockPriceMissingErpSection,
  StockPriceMissingScanSummary,
} from "@/lib/stock-price-missing/build-content";

function sheetFromSection(section: StockPriceMissingErpSection) {
  const header = [
    "#",
    "SKU",
    "Item name",
    "Locations (stock)",
    "Stock",
    "Standard Selling",
    "OGF",
    "Gap",
  ];
  const data = section.rows.map((row, index) => [
    index + 1,
    row.sku,
    row.itemName,
    formatLocationsCell(row.locations),
    row.totalStock,
    row.standardRate ?? "Missing",
    row.ogfRate ?? "Missing",
    row.gap,
  ]);
  return XLSX.utils.aoa_to_sheet([header, ...data]);
}

function sheetName(label: string, fallback: string): string {
  const raw = (label || fallback).slice(0, 28);
  return raw.replace(/[\\/?*[\]]/g, "_") || fallback;
}

export function buildStockPriceMissingWorkbook(
  scan: StockPriceMissingScanSummary,
): Buffer {
  const workbook = XLSX.utils.book_new();
  // Fixed sheet names — instance labels (e.g. "ERP2") must not rename sections.
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromSection(scan.erp1),
    sheetName("ERP1", "ERP1"),
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromSection(scan.erp2),
    sheetName("ERP2", "ERP2"),
  );
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

export function stockPriceMissingExcelFileName(reportDateLabel: string): string {
  const safe = reportDateLabel.replace(/[^\dA-Za-z]+/g, "-").replace(/^-|-$/g, "");
  return `selling-price-gaps-${safe || "report"}.xlsx`;
}
