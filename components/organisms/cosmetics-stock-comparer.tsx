"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx-js-style";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import {
  BRAND_WAREHOUSE_VIOLATION_HEADERS,
  COSMETICS_STOCK_REPORT_HEADERS,
  type BrandWarehouseViolation,
  type CosmeticsStockReportDetail,
} from "@/lib/cosmetics-stock-comparer";

type LiveStockResponse = {
  threshold: number;
  itemCount: number;
  warehouseCount: number;
  rows: CosmeticsStockReportDetail[];
  brandViolations: BrandWarehouseViolation[];
  error?: string;
  detail?: string;
};

function appendBrandCheckSheet(workbook: XLSX.WorkBook, rows: BrandWarehouseViolation[]) {
  const sheetRows: Array<Array<string | number>> = [
    [...BRAND_WAREHOUSE_VIOLATION_HEADERS],
    ...rows.map((row) => [
      row.SKU,
      row["Product Title"],
      row.Brand,
      row["ERP Source"],
      row.Warehouse,
      row["Balance Qty"],
      row.Rule,
    ]),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(sheetRows.length - 1, 0), c: BRAND_WAREHOUSE_VIOLATION_HEADERS.length - 1 },
    }),
  };
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 44 },
    { wch: 18 },
    { wch: 12 },
    { wch: 32 },
    { wch: 12 },
    { wch: 42 },
  ];
  worksheet["!rows"] = sheetRows.map((_, index) => ({ hpt: index === 0 ? 20 : 17 }));

  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1:G1");
  const border = {
    top: { style: "thin", color: { rgb: "D9D9D9" } },
    bottom: { style: "thin", color: { rgb: "D9D9D9" } },
    left: { style: "thin", color: { rgb: "D9D9D9" } },
    right: { style: "thin", color: { rgb: "D9D9D9" } },
  };

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[ref];
      if (!cell) continue;
      cell.s = {
        alignment: {
          horizontal: c === 1 || c === 4 || c === 6 ? "left" : "center",
          vertical: "center",
        },
        border,
      };
    }
  }

  for (let c = range.s.c; c <= range.e.c; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    const cell = worksheet[ref];
    if (!cell) continue;
    cell.s = {
      ...(cell.s ?? {}),
      alignment: { horizontal: "center", vertical: "center" },
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "006B5B" } },
      border,
    };
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Brand Warehouse Check");
}

function exportReport(rows: CosmeticsStockReportDetail[], brandViolations: BrandWarehouseViolation[]) {
  const workbook = XLSX.utils.book_new();
  const sheetRows: Array<Array<string | number>> = [[...COSMETICS_STOCK_REPORT_HEADERS]];
  const merges: XLSX.Range[] = [];

  rows.forEach((row) => {
    const maxLines = Math.max(row.priority1.length, row.priority2.length, row.priority3.length, 1);
    const startRow = sheetRows.length;
    for (let i = 0; i < maxLines; i++) {
      sheetRows.push([
        i === 0 ? row.SKU : "",
        i === 0 ? row["Product Title"] : "",
        i === 0 ? row["Main Warehouse Qty"] : "",
        row.priority1[i]?.outlet ?? "",
        row.priority1[i]?.qty ?? "",
        row.priority2[i]?.outlet ?? "",
        row.priority2[i]?.qty ?? "",
        row.priority3[i]?.outlet ?? "",
        row.priority3[i]?.qty ?? "",
        i === 0 ? row["Stock Available Elsewhere"].toUpperCase() : "",
      ]);
    }

    if (maxLines > 1) {
      const endRow = startRow + maxLines - 1;
      for (const col of [0, 1, 2, 9]) {
        merges.push({ s: { r: startRow, c: col }, e: { r: endRow, c: col } });
      }
    }
  });

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!merges"] = merges;
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(sheetRows.length - 1, 0), c: COSMETICS_STOCK_REPORT_HEADERS.length - 1 },
    }),
  };
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 42 },
    { wch: 16 },
    { wch: 24 },
    { wch: 12 },
    { wch: 24 },
    { wch: 12 },
    { wch: 24 },
    { wch: 12 },
    { wch: 24 },
  ];
  worksheet["!rows"] = sheetRows.map((_, index) => ({ hpt: index === 0 ? 20 : 17 }));

  const range = XLSX.utils.decode_range(worksheet["!ref"] ?? "A1:J1");
  const border = {
    top: { style: "thin", color: { rgb: "D9D9D9" } },
    bottom: { style: "thin", color: { rgb: "D9D9D9" } },
    left: { style: "thin", color: { rgb: "D9D9D9" } },
    right: { style: "thin", color: { rgb: "D9D9D9" } },
  };

  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[ref];
      if (!cell) continue;
      cell.s = {
        alignment: {
          horizontal: c === 1 || c === 3 || c === 5 || c === 7 ? "left" : "center",
          vertical: "center",
        },
        border,
      };
    }
  }

  for (let c = range.s.c; c <= range.e.c; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    const cell = worksheet[ref];
    if (!cell) continue;
    cell.s = {
      ...(cell.s ?? {}),
      alignment: { horizontal: "center", vertical: "center" },
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { patternType: "solid", fgColor: { rgb: "006B5B" } },
      border,
    };
  }

  for (let r = 1; r <= range.e.r; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: 9 });
    const cell = worksheet[ref];
    if (!cell) continue;
    cell.s = {
      ...(cell.s ?? {}),
      alignment: { horizontal: "center", vertical: "center" },
      font: { bold: true, color: { rgb: "006100" } },
      fill: { patternType: "solid", fgColor: { rgb: "C6E8C8" } },
      border,
    };
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Compare");
  appendBrandCheckSheet(workbook, brandViolations);
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `cosmetics-stock-compare-${today}.xlsx`);
}

export function CosmeticsStockComparer() {
  const [threshold, setThreshold] = useState("0");
  const [reportRows, setReportRows] = useState<CosmeticsStockReportDetail[]>([]);
  const [brandViolations, setBrandViolations] = useState<BrandWarehouseViolation[]>([]);
  const [processing, setProcessing] = useState(false);
  const [lastLoad, setLastLoad] = useState<{
    threshold: number;
    itemCount: number;
    warehouseCount: number;
  } | null>(null);

  async function runReport() {
    const thresholdNumber = Number(threshold);
    if (!Number.isFinite(thresholdNumber)) {
      notify.error("Stock threshold must be a number");
      return;
    }

    setProcessing(true);
    try {
      const params = new URLSearchParams({ threshold: String(thresholdNumber) });
      const res = await fetch(`/api/admin/reports/stock-comparer?${params}`, {
        method: "GET",
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as Partial<LiveStockResponse>;
      if (!res.ok) {
        throw new Error(data.detail || data.error || "Could not run report");
      }
      setReportRows(data.rows ?? []);
      setBrandViolations(data.brandViolations ?? []);
      setLastLoad({
        threshold: data.threshold ?? thresholdNumber,
        itemCount: data.itemCount ?? 0,
        warehouseCount: data.warehouseCount ?? 0,
      });
      notify.success(`Report ready for ${data.itemCount ?? 0} SKU(s)`);
    } catch (err) {
      setReportRows([]);
      setBrandViolations([]);
      setLastLoad(null);
      notify.error(err instanceof Error ? err.message : "Could not run report");
    } finally {
      setProcessing(false);
    }
  }

  const availableCount = reportRows.filter((row) => row["Stock Available Elsewhere"] === "Yes").length;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Cosmetics Stock Comparer</h3>
        <p className="text-sm text-muted-foreground">
          Run the report from live ERP stock and export low main-warehouse stock with outlet availability.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <label className="text-sm font-medium">
          Stock threshold
          <Input
            className="mt-1"
            type="number"
            step="any"
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
          />
        </label>
        <div className="flex min-h-32 flex-col justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-6">
          <div>
            <p className="text-sm font-medium">Stock report</p>
            <p className="text-xs text-muted-foreground">
              Fetches ERPNext Bin stock using the same configured OSF warehouses and ERP instances.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void runReport()}
            disabled={processing}
            className="w-fit gap-2"
          >
            {processing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Run report
          </Button>
          {lastLoad && (
            <p className="text-xs text-muted-foreground">
              Report ran from {lastLoad.warehouseCount} warehouse(s) for {lastLoad.itemCount} SKU(s).
              Threshold: {lastLoad.threshold}.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => exportReport(reportRows, brandViolations)}
          disabled={processing || (reportRows.length === 0 && brandViolations.length === 0)}
          className="gap-2"
        >
          {processing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Export report
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="size-4" />
          {reportRows.length} flagged SKU(s), {availableCount} with stock elsewhere, {brandViolations.length} brand issue(s)
        </div>
      </div>

      {reportRows.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-md border">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="sticky top-0 bg-background">
              <tr>
                {COSMETICS_STOCK_REPORT_HEADERS.map((header) => (
                  <th key={header} className="border-b px-2 py-2 font-medium">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reportRows.slice(0, 100).map((row) => (
                <tr key={row.SKU} className="border-b last:border-b-0">
                  {COSMETICS_STOCK_REPORT_HEADERS.map((header) => (
                    <td key={header} className="px-2 py-2">
                      {row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
