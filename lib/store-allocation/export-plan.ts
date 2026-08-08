import * as XLSX from "xlsx";

import { formatAppIsoDate } from "@/lib/format-datetime";

export type StoreAllocationExportInput = {
  sku: string;
  description: string;
  barcode?: string | null;
  companyReorderQty: number;
  takeQty: number;
  locations: Array<{ label: string; qty: number }>;
};

export function buildStoreAllocationWorkbookBuffer(input: StoreAllocationExportInput): Buffer {
  const headerRows = [
    ["SKU", input.sku],
    ["Barcode", input.barcode ?? ""],
    ["Description", input.description],
    ["Company reorder qty (TOTAL ORDER QTY)", input.companyReorderQty],
    ["Take qty", input.takeQty],
    [],
    ["Location", "Qty"],
  ];
  const dataRows = input.locations.map((l) => [l.label, l.qty]);
  const aoa = [...headerRows, ...dataRows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Allocation");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

export function storeAllocationExportFilename(sku: string, date = formatAppIsoDate(new Date())) {
  const safe = sku.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 40) || "sku";
  return `store-allocation-${safe}-${date}.xlsx`;
}
