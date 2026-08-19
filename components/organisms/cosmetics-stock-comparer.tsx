"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import * as XLSX from "xlsx-js-style";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import {
  buildCosmeticsStockReportDetails,
  COSMETICS_STOCK_REPORT_HEADERS,
  type CosmeticsStockReportDetail,
  type StockBalanceRow,
} from "@/lib/cosmetics-stock-comparer";

type LoadedFile = {
  name: string;
  rows: number;
};

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

function parseWorkbook(buffer: ArrayBuffer, filename: string): StockBalanceRow[] {
  const lower = filename.toLowerCase();
  const workbook = lower.endsWith(".csv")
    ? XLSX.read(new TextDecoder().decode(buffer), { type: "string" })
    : XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) throw new Error(`No readable sheet found in ${filename}`);
  return XLSX.utils.sheet_to_json<StockBalanceRow>(sheet, { defval: "" });
}

function exportReport(rows: CosmeticsStockReportDetail[]) {
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
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `cosmetics-stock-compare-${today}.xlsx`);
}

export function CosmeticsStockComparer() {
  const [threshold, setThreshold] = useState("0");
  const [loadedFiles, setLoadedFiles] = useState<LoadedFile[]>([]);
  const [reportRows, setReportRows] = useState<CosmeticsStockReportDetail[]>([]);
  const [processing, setProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  async function onFilesChange(files: FileList | null) {
    if (!files?.length) return;
    const thresholdNumber = Number(threshold);
    if (!Number.isFinite(thresholdNumber)) {
      notify.error("Stock threshold must be a number");
      return;
    }

    setProcessing(true);
    try {
      const parsedFiles: LoadedFile[] = [];
      const allRows: StockBalanceRow[] = [];
      for (const file of Array.from(files)) {
        const buffer = await readFile(file);
        const rows = parseWorkbook(buffer, file.name);
        parsedFiles.push({ name: file.name, rows: rows.length });
        allRows.push(...rows);
      }
      const nextReport = buildCosmeticsStockReportDetails(allRows, thresholdNumber);
      setLoadedFiles(parsedFiles);
      setReportRows(nextReport);
      notify.success(`Compared ${allRows.length} stock rows`);
    } catch (err) {
      setLoadedFiles([]);
      setReportRows([]);
      notify.error(err instanceof Error ? err.message : "Could not compare stock files");
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
          Upload stock balance files and export low main-warehouse stock with outlet availability.
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
        <div className="space-y-1">
          <p className="text-sm font-medium">Stock balance files</p>
          <label
            className={`flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:bg-muted/40"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              void onFilesChange(event.dataTransfer.files);
            }}
          >
            {processing ? (
              <Loader2 className="size-7 animate-spin text-muted-foreground" />
            ) : (
              <Upload className="size-7 text-muted-foreground" />
            )}
            <span className="text-sm font-medium">Drop stock files here or click to browse</span>
            <span className="text-xs text-muted-foreground">.xlsx, .xls, or .csv files</span>
            <Input
              className="sr-only"
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              onChange={(event) => void onFilesChange(event.target.files)}
            />
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => exportReport(reportRows)}
          disabled={processing || reportRows.length === 0}
          className="gap-2"
        >
          {processing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          Export report
        </Button>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="size-4" />
          {reportRows.length} flagged SKU(s), {availableCount} with stock elsewhere
        </div>
      </div>

      {loadedFiles.length > 0 && (
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <Upload className="size-4" />
            Loaded files
          </div>
          <ul className="space-y-1 text-muted-foreground">
            {loadedFiles.map((file) => (
              <li key={file.name}>
                {file.name} ({file.rows} rows)
              </li>
            ))}
          </ul>
        </div>
      )}

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
