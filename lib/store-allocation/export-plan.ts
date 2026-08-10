import * as XLSX from "xlsx";

import { formatAppIsoDate } from "@/lib/format-datetime";

export type StoreAllocationExportInput = {
  sku: string;
  description: string;
  barcode?: string | null;
  companyReorderQty: number;
  takeQty: number;
  locations: Array<{ label: string; qty: number; columnKey?: string }>;
};

export type StoreAllocationMultiExportItem = StoreAllocationExportInput;

export function buildStoreAllocationWorkbookBuffer(input: StoreAllocationExportInput): Buffer {
  return buildMultiStoreAllocationWorkbookBuffer([input]);
}

export function buildMultiStoreAllocationWorkbookBuffer(
  items: StoreAllocationMultiExportItem[],
): Buffer {
  const wb = XLSX.utils.book_new();

  const byLocationRows: Array<Array<string | number>> = [["Location", "SKU", "Qty"]];
  const locationTotals = new Map<string, number>();
  for (const item of items) {
    for (const loc of item.locations) {
      if (loc.qty <= 0) continue;
      byLocationRows.push([loc.label, item.sku, loc.qty]);
      locationTotals.set(loc.label, (locationTotals.get(loc.label) ?? 0) + loc.qty);
    }
  }
  byLocationRows.push([]);
  byLocationRows.push(["Location", "Total qty", ""]);
  for (const [label, total] of locationTotals) {
    byLocationRows.push([label, total, ""]);
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(byLocationRows),
    "By location",
  );

  for (const item of items) {
    const headerRows = [
      ["SKU", item.sku],
      ["Barcode", item.barcode ?? ""],
      ["Description", item.description],
      ["Company reorder qty (TOTAL ORDER QTY)", item.companyReorderQty],
      ["Take qty", item.takeQty],
      [],
      ["Location", "Qty"],
    ];
    const dataRows = item.locations.map((l) => [l.label, l.qty]);
    const sheetName = safeSheetName(item.sku);
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]),
      sheetName,
    );
  }

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function safeSheetName(sku: string): string {
  const base = sku.replace(/[\\/?*\[\]:]/g, "_").slice(0, 28) || "SKU";
  return base;
}

export function storeAllocationExportFilename(sku: string, date = formatAppIsoDate(new Date())) {
  const safe = sku.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 40) || "sku";
  return `store-allocation-${safe}-${date}.xlsx`;
}

export function storeAllocationMultiExportFilename(date = formatAppIsoDate(new Date())) {
  return `store-allocation-multi-${date}.xlsx`;
}
