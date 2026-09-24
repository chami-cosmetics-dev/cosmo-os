"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx-js-style";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  salesWindow?: { from: string; to: string; timezone: string; days: number } | null;
  salesStatus?: "ok" | "unavailable";
  criticalCutoffUnits?: number | null;
  rows: CosmeticsStockReportDetail[];
  brandViolations: BrandWarehouseViolation[];
  error?: string;
  detail?: string;
};

const STOCK_EXPORT_HEADERS = [
  ...COSMETICS_STOCK_REPORT_HEADERS.slice(0, 5),
  "Online Warehouse",
  "Online Qty",
  "Shop Warehouse",
  "Shop Qty",
  "Stock Available Elsewhere",
] as const;

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

function exportBrandReport(rows: BrandWarehouseViolation[]) {
  const workbook = XLSX.utils.book_new();
  appendBrandCheckSheet(workbook, rows);
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `cosmetics-brand-erp-check-${today}.xlsx`);
}

function exportStockReport(rows: CosmeticsStockReportDetail[]) {
  const workbook = XLSX.utils.book_new();
  const sheetRows: Array<Array<string | number>> = [[...STOCK_EXPORT_HEADERS]];
  const merges: XLSX.Range[] = [];

  rows.forEach((row) => {
    const maxLines = Math.max(row.online.length, row.shops.length, 1);
    const startRow = sheetRows.length;
    for (let i = 0; i < maxLines; i++) {
      sheetRows.push([
        i === 0 ? row.SKU : "",
        i === 0 ? row["Product Title"] : "",
        i === 0 ? row["Main Warehouse Qty"] : "",
        i === 0 ? row.sales90d : "",
        i === 0 ? (row.critical ? "CRITICAL" : "") : "",
        row.online[i]?.name ?? "",
        row.online[i]?.qty ?? "",
        row.shops[i]?.name ?? "",
        row.shops[i]?.qty ?? "",
        i === 0 ? row["Stock Available Elsewhere"].toUpperCase() : "",
      ]);
    }

    if (maxLines > 1) {
      const endRow = startRow + maxLines - 1;
      for (const col of [0, 1, 2, 3, 4, 9]) {
        merges.push({ s: { r: startRow, c: col }, e: { r: endRow, c: col } });
      }
    }
  });

  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!merges"] = merges;
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(sheetRows.length - 1, 0), c: STOCK_EXPORT_HEADERS.length - 1 },
    }),
  };
  worksheet["!cols"] = [
    { wch: 18 },
    { wch: 42 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
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
          horizontal: c === 1 || c === 5 || c === 7 ? "left" : "center",
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
    const elsewhereRef = XLSX.utils.encode_cell({ r, c: 9 });
    const elsewhere = worksheet[elsewhereRef];
    if (elsewhere) {
      elsewhere.s = {
        ...(elsewhere.s ?? {}),
        alignment: { horizontal: "center", vertical: "center" },
        font: { bold: true, color: { rgb: "006100" } },
        fill: { patternType: "solid", fgColor: { rgb: "C6E8C8" } },
        border,
      };
    }
    const criticalRef = XLSX.utils.encode_cell({ r, c: 4 });
    const critical = worksheet[criticalRef];
    if (critical && String(critical.v ?? "").toUpperCase() === "CRITICAL") {
      critical.s = {
        ...(critical.s ?? {}),
        alignment: { horizontal: "center", vertical: "center" },
        font: { bold: true, color: { rgb: "9F1D1D" } },
        fill: { patternType: "solid", fgColor: { rgb: "F8D0D0" } },
        border,
      };
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, "Stock Compare");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `cosmetics-stock-compare-${today}.xlsx`);
}

function tableCell(row: CosmeticsStockReportDetail, header: (typeof COSMETICS_STOCK_REPORT_HEADERS)[number]) {
  if (header === "Critical") {
    return row.critical ? (
      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800">
        Critical
      </span>
    ) : (
      ""
    );
  }
  if (header === "90-day Sales") return row.sales90d;
  return row[header];
}

export function CosmeticsStockComparer() {
  const [tab, setTab] = useState("main");
  const [threshold, setThreshold] = useState("0");
  const [reportRows, setReportRows] = useState<CosmeticsStockReportDetail[]>([]);
  const [brandViolations, setBrandViolations] = useState<BrandWarehouseViolation[]>([]);
  const [processing, setProcessing] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [lastLoad, setLastLoad] = useState<{
    threshold: number;
    itemCount: number;
    warehouseCount: number;
    salesStatus: "ok" | "unavailable";
    salesWindow: LiveStockResponse["salesWindow"];
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
      setHasRun(true);
      setLastLoad({
        threshold: data.threshold ?? thresholdNumber,
        itemCount: data.itemCount ?? 0,
        warehouseCount: data.warehouseCount ?? 0,
        salesStatus: data.salesStatus === "unavailable" ? "unavailable" : "ok",
        salesWindow: data.salesWindow ?? null,
      });
      notify.success(`Report ready for ${data.itemCount ?? 0} SKU(s)`);
    } catch (err) {
      setReportRows([]);
      setBrandViolations([]);
      setHasRun(false);
      setLastLoad(null);
      notify.error(err instanceof Error ? err.message : "Could not run report");
    } finally {
      setProcessing(false);
    }
  }

  const availableCount = reportRows.filter((row) => row["Stock Available Elsewhere"] === "Yes").length;
  const criticalCount = reportRows.filter((row) => row.critical).length;
  const isBusy = processing;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Cosmetics Stock Comparer</h3>
        <p className="text-sm text-muted-foreground">
          Compare Cosmetics main against other online warehouses first, then shops. Protect Shopify-facing
          sales when main stock drops.
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
            disabled={isBusy}
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
            disabled={isBusy}
            className="w-fit gap-2"
          >
            {processing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" />}
            {processing ? "Running..." : "Run report"}
          </Button>
          {lastLoad && (
            <p className="text-xs text-muted-foreground">
              Last run: {lastLoad.warehouseCount} warehouse(s), {lastLoad.itemCount} SKU(s). Threshold:{" "}
              {lastLoad.threshold}.
              {lastLoad.salesWindow
                ? ` Sales ${lastLoad.salesWindow.from}–${lastLoad.salesWindow.to} (${lastLoad.salesWindow.timezone}).`
                : ""}
            </p>
          )}
          {lastLoad?.salesStatus === "unavailable" && (
            <p className="text-xs text-amber-700">
              Sales ranking unavailable. Stock comparison is shown without Critical badges.
            </p>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="main" disabled={isBusy}>
            Main
          </TabsTrigger>
          <TabsTrigger value="brand" disabled={isBusy}>
            Brand
          </TabsTrigger>
        </TabsList>

        <TabsContent value="main" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={() => exportStockReport(reportRows)}
              disabled={isBusy || reportRows.length === 0}
              className="gap-2"
            >
              {processing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" />}
              Export stock report
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="size-4" />
              {reportRows.length} flagged SKU(s), {availableCount} with stock elsewhere, {criticalCount}{" "}
              Critical
            </div>
          </div>

          {hasRun && reportRows.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No Cosmetics-main items at or below the last-run threshold.
            </p>
          )}

          {reportRows.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full min-w-[1100px] text-left text-xs">
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
                          {tableCell(row, header)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="brand" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => exportBrandReport(brandViolations)}
              disabled={isBusy || brandViolations.length === 0}
              className="gap-2"
            >
              <Download className="size-4" />
              Export brand report
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="size-4" />
              {brandViolations.length} brand issue(s)
            </div>
          </div>

          {hasRun && brandViolations.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No brand-on-wrong-company violations in this run.
            </p>
          )}

          {!hasRun && (
            <p className="text-sm text-muted-foreground">Run the report to load brand checks.</p>
          )}

          {brandViolations.length > 0 && (
            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="sticky top-0 bg-background">
                  <tr>
                    {BRAND_WAREHOUSE_VIOLATION_HEADERS.map((header) => (
                      <th key={header} className="border-b px-2 py-2 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {brandViolations.slice(0, 100).map((row, index) => (
                    <tr key={`${row.SKU}-${row.Warehouse}-${index}`} className="border-b last:border-b-0">
                      {BRAND_WAREHOUSE_VIOLATION_HEADERS.map((header) => (
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
