"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { Upload, FileText, Calculator, Download, AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// KokoCompany option type
// ---------------------------------------------------------------------------

type KokoCompanyOption = {
  id: string;
  label: string;
  kokoName: string;
  invoicePrefix: string;
};

// ---------------------------------------------------------------------------
// CSV Parsing
// ---------------------------------------------------------------------------

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length === 0) return [];

  const headerLine = lines[0];
  const headers = parseCSVRow(headerLine);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCSVRow(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function parseDate(value: string): Date | null {
  if (!value) return null;
  // Try ISO, DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
  const iso = new Date(value);
  if (!isNaN(iso.getTime())) return iso;

  // DD/MM/YYYY
  const dmyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const d = new Date(
      Number(dmyMatch[3]),
      Number(dmyMatch[2]) - 1,
      Number(dmyMatch[1])
    );
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function isInRange(dateStr: string, from: Date, to: Date): boolean {
  const d = parseDate(dateStr);
  if (!d) return false;
  return d >= startOfDay(from) && d <= endOfDay(to);
}

// ---------------------------------------------------------------------------
// Tally types
// ---------------------------------------------------------------------------

type Dump2Row = Record<string, string>;
type KokoRow = Record<string, string>;

type MatchedPair = {
  kokoRow: KokoRow;
  dump2Row: Dump2Row;
  kokoAmount: number;
  dump2Amount: number;
};

type TallyResult = {
  matched: MatchedPair[];
  unmatchedKoko: KokoRow[];
  unmatchedDump2: Dump2Row[];
  extendedMatched: MatchedPair[];
  extendedUnmatchedKoko: KokoRow[];
  extendedUnmatchedDump2: Dump2Row[];
};

// ---------------------------------------------------------------------------
// Auto-detect date column in Koko file
// ---------------------------------------------------------------------------

function detectDateColumn(headers: string[]): string | null {
  // Exact match first, then fallback
  if (headers.includes("DATE")) return "DATE";
  const dateCols = headers.filter((h) => /date/i.test(h) || /time/i.test(h));
  return dateCols[0] ?? null;
}

// ---------------------------------------------------------------------------
// Core tally logic
// ---------------------------------------------------------------------------

function greedyMatch(
  kokoRows: KokoRow[],
  dump2Rows: Dump2Row[],
  kokoAmountCol: string,
  dump2AmountCol: string
): { matched: MatchedPair[]; unmatchedKoko: KokoRow[]; unmatchedDump2: Dump2Row[] } {
  const matched: MatchedPair[] = [];
  const usedDump2 = new Set<number>();

  const unmatchedKoko: KokoRow[] = [];

  for (const kokoRow of kokoRows) {
    const kokoAmt = parseFloat(kokoRow[kokoAmountCol]?.replace(/,/g, "") ?? "");
    if (isNaN(kokoAmt)) {
      unmatchedKoko.push(kokoRow);
      continue;
    }

    let foundIdx = -1;
    for (let i = 0; i < dump2Rows.length; i++) {
      if (usedDump2.has(i)) continue;
      const dump2Amt = parseFloat(dump2Rows[i][dump2AmountCol]?.replace(/,/g, "") ?? "");
      if (isNaN(dump2Amt)) continue;
      if (Math.abs(dump2Amt - kokoAmt) < 0.005) {
        foundIdx = i;
        break;
      }
    }

    if (foundIdx >= 0) {
      usedDump2.add(foundIdx);
      const dump2Amt = parseFloat(dump2Rows[foundIdx][dump2AmountCol]?.replace(/,/g, "") ?? "");
      matched.push({
        kokoRow,
        dump2Row: dump2Rows[foundIdx],
        kokoAmount: kokoAmt,
        dump2Amount: dump2Amt,
      });
    } else {
      unmatchedKoko.push(kokoRow);
    }
  }

  const unmatchedDump2 = dump2Rows.filter((_, i) => !usedDump2.has(i));
  return { matched, unmatchedKoko, unmatchedDump2 };
}

function runTally(
  allDump2Rows: Dump2Row[],
  allKokoRows: KokoRow[],
  params: {
    primaryFrom: Date;
    primaryTo: Date;
    extendedFrom: Date | null;
    extendedTo: Date | null;
    companyName: string;
    prefix: string;
    kokoDateCol: string | null;
  }
): TallyResult {
  const { primaryFrom, primaryTo, extendedFrom, extendedTo, companyName, prefix, kokoDateCol } = params;

  // --- Filter Dump 2 ---
  const filteredDump2 = allDump2Rows.filter((row) => {
    // Payment gateway must contain "koko" (case-insensitive)
    if (!row["payment_gateway"]?.toLowerCase().includes("koko")) return false;
    // Payment status must NOT be "voided"
    if (row["payment_status"]?.toLowerCase().includes("voided")) return false;
    // Prefix filter on invoice_no
    if (prefix) {
      const invoiceNo = row["invoice_no"] ?? "";
      if (!invoiceNo.startsWith(prefix)) return false;
    }
    return true;
  });

  // Split dump2 by primary/extended date
  const dump2Primary = filteredDump2.filter((row) =>
    isInRange(row["invoice_date"] ?? "", primaryFrom, primaryTo)
  );
  const dump2Extended =
    extendedFrom && extendedTo
      ? filteredDump2.filter((row) =>
          isInRange(row["invoice_date"] ?? "", extendedFrom, extendedTo)
        )
      : [];

  // --- Filter Koko file ---
  const filteredKoko = allKokoRows.filter((row) => {
    // Company name filter: BRANCH_NAME column must contain the company name
    if (companyName) {
      const branchName = row["BRANCH_NAME"] ?? "";
      if (!branchName.toLowerCase().includes(companyName.toLowerCase())) return false;
    }
    return true;
  });

  // Use DATE column; fallback to auto-detect
  let kokoDateColResolved = kokoDateCol;
  if (!kokoDateColResolved && filteredKoko.length > 0) {
    kokoDateColResolved = detectDateColumn(Object.keys(filteredKoko[0]));
  }

  const kokoPrimary = kokoDateColResolved
    ? filteredKoko.filter((row) =>
        isInRange(row[kokoDateColResolved!] ?? "", primaryFrom, primaryTo)
      )
    : filteredKoko;

  const kokoExtended =
    extendedFrom && extendedTo && kokoDateColResolved
      ? filteredKoko.filter((row) =>
          isInRange(row[kokoDateColResolved!] ?? "", extendedFrom, extendedTo)
        )
      : [];

  // Use PRODUCT_VALUE column
  const kokoAmountCol =
    Object.keys(filteredKoko[0] ?? {}).find((k) => k === "PRODUCT_VALUE") ??
    Object.keys(filteredKoko[0] ?? {}).find((k) => /product.?value/i.test(k)) ??
    "PRODUCT_VALUE";

  // --- Primary tally ---
  const primary = greedyMatch(kokoPrimary, dump2Primary, kokoAmountCol, "grand_total");

  // --- Extended tally for unmatched koko ---
  let extendedMatched: MatchedPair[] = [];
  let extendedUnmatchedKoko: KokoRow[] = [];
  let extendedUnmatchedDump2: Dump2Row[] = [];

  if (primary.unmatchedKoko.length > 0 && dump2Extended.length > 0) {
    const ext = greedyMatch(primary.unmatchedKoko, dump2Extended, kokoAmountCol, "grand_total");
    extendedMatched = ext.matched;
    extendedUnmatchedKoko = ext.unmatchedKoko;
    extendedUnmatchedDump2 = ext.unmatchedDump2;
  } else {
    extendedUnmatchedKoko = primary.unmatchedKoko;
  }

  return {
    matched: primary.matched,
    unmatchedKoko: primary.unmatchedKoko,
    unmatchedDump2: primary.unmatchedDump2,
    extendedMatched,
    extendedUnmatchedKoko,
    extendedUnmatchedDump2,
  };
}

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function makeSheetData(headers: string[], rows: Record<string, string>[]): Record<string, string>[] {
  return rows.map((row) => {
    const r: Record<string, string> = {};
    headers.forEach((h) => (r[h] = row[h] ?? ""));
    return r;
  });
}

function downloadXLSX(sheets: { name: string; headers: string[]; rows: Record<string, string>[] }[], filename: string) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data = makeSheetData(sheet.headers, sheet.rows);
    const ws = XLSX.utils.json_to_sheet(data, { header: sheet.headers });
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  XLSX.writeFile(wb, filename);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KokoTallyPanel() {
  // --- File state ---
  const [dump2Rows, setDump2Rows] = useState<Dump2Row[] | null>(null);
  const [dump2FileName, setDump2FileName] = useState<string>("");
  const [dump2Error, setDump2Error] = useState<string>("");

  const [kokoRows, setKokoRows] = useState<KokoRow[] | null>(null);
  const [kokoFileName, setKokoFileName] = useState<string>("");
  const [kokoError, setKokoError] = useState<string>("");

  // --- Filters ---
  const [primaryFrom, setPrimaryFrom] = useState("");
  const [primaryTo, setPrimaryTo] = useState("");
  const [extendedFrom, setExtendedFrom] = useState("");
  const [extendedTo, setExtendedTo] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [prefix, setPrefix] = useState("");

  // --- Company quick-fill ---
  const [kokoCompanyOptions, setKokoCompanyOptions] = useState<KokoCompanyOption[]>([]);
  const [selectedKokoId, setSelectedKokoId] = useState<string>("");

  // --- Result ---
  const [result, setResult] = useState<TallyResult | null>(null);
  const [tallyError, setTallyError] = useState<string>("");

  const dump2FileRef = useRef<HTMLInputElement>(null);
  const kokoFileRef = useRef<HTMLInputElement>(null);

  const [dump2DragOver, setDump2DragOver] = useState(false);
  const [kokoDragOver, setKokoDragOver] = useState(false);

  // ---- Fetch company options on mount ----
  useEffect(() => {
    fetch("/api/admin/settings/koko-companies")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: KokoCompanyOption[] | null) => {
        if (Array.isArray(data)) setKokoCompanyOptions(data);
      })
      .catch(() => {}); // silently ignore errors
  }, []);

  // ---- Reset all state ----
  const handleReset = useCallback(() => {
    setDump2Rows(null);
    setDump2FileName("");
    setDump2Error("");
    setKokoRows(null);
    setKokoFileName("");
    setKokoError("");
    setPrimaryFrom("");
    setPrimaryTo("");
    setExtendedFrom("");
    setExtendedTo("");
    setCompanyName("");
    setPrefix("");
    setSelectedKokoId("");
    setResult(null);
    setTallyError("");
    if (dump2FileRef.current) dump2FileRef.current.value = "";
    if (kokoFileRef.current) kokoFileRef.current.value = "";
  }, []);

  // ---- Shared file reader ----
  const readCSVFile = useCallback(
    (
      file: File,
      onRows: (rows: Record<string, string>[], fileName: string) => void,
      onError: (msg: string) => void
    ) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (!text) { onError("Could not read file"); return; }
        const rows = parseCSV(text);
        if (rows.length === 0) { onError("No data rows found in file"); return; }
        onRows(rows, file.name);
      };
      reader.onerror = () => onError("Failed to read file");
      reader.readAsText(file);
    },
    []
  );

  // ---- Upload Dump 2 ----
  const processDump2File = useCallback((file: File) => {
    setDump2Error("");
    setDump2Rows(null);
    setDump2FileName(file.name);
    readCSVFile(
      file,
      (rows) => {
        const headers = Object.keys(rows[0]);
        const hasPaymentGateway = headers.some((h) => /payment.?gateway/i.test(h));
        const hasGrandTotal = headers.some((h) => /grand.?total/i.test(h));
        if (!hasPaymentGateway || !hasGrandTotal) {
          setDump2Error('Warning: Expected columns (payment_gateway, grand_total) not found. Make sure this is a Dump 2 CSV.');
        }
        setDump2Rows(rows);
      },
      setDump2Error
    );
  }, [readCSVFile]);

  const handleDump2File = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processDump2File(file);
  }, [processDump2File]);

  const handleDump2Drop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDump2DragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processDump2File(file);
  }, [processDump2File]);

  // ---- Upload Koko file ----
  const processKokoFile = useCallback((file: File) => {
    setKokoError("");
    setKokoRows(null);
    setKokoFileName(file.name);
    readCSVFile(
      file,
      (rows) => {
        const headers = Object.keys(rows[0]);
        const hasBranch = headers.includes("BRANCH_NAME");
        const hasProductValue = headers.includes("PRODUCT_VALUE");
        if (!hasBranch) {
          setKokoError('Warning: No "BRANCH_NAME" column detected. Company filter will be skipped.');
        }
        if (!hasProductValue) {
          setKokoError((prev) =>
            prev
              ? prev + ' Also, no "PRODUCT_VALUE" column found.'
              : 'No "PRODUCT_VALUE" column found in Koko file.'
          );
        }
        setKokoRows(rows);
      },
      setKokoError
    );
  }, [readCSVFile]);

  const handleKokoFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processKokoFile(file);
  }, [processKokoFile]);

  const handleKokoDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setKokoDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processKokoFile(file);
  }, [processKokoFile]);

  // ---- Run tally ----
  const handleTally = useCallback(() => {
    setTallyError("");
    setResult(null);

    if (!dump2Rows || dump2Rows.length === 0) {
      setTallyError("Please upload Dump 2 first.");
      return;
    }
    if (!kokoRows || kokoRows.length === 0) {
      setTallyError("Please upload a Koko file.");
      return;
    }
    if (!primaryFrom || !primaryTo) {
      setTallyError("Please select a primary date range.");
      return;
    }

    const pFrom = new Date(primaryFrom);
    const pTo = new Date(primaryTo);
    if (isNaN(pFrom.getTime()) || isNaN(pTo.getTime())) {
      setTallyError("Invalid primary date range.");
      return;
    }

    let eFrom: Date | null = null;
    let eTo: Date | null = null;
    if (extendedFrom && extendedTo) {
      eFrom = new Date(extendedFrom);
      eTo = new Date(extendedTo);
      if (isNaN(eFrom.getTime()) || isNaN(eTo.getTime())) {
        setTallyError("Invalid extended date range.");
        return;
      }
    }

    // Use DATE column for koko
    const kokoHeaders = Object.keys(kokoRows[0] ?? {});
    const kokoDateCol = kokoHeaders.includes("DATE") ? "DATE" : detectDateColumn(kokoHeaders);

    const tallyResult = runTally(dump2Rows, kokoRows, {
      primaryFrom: pFrom,
      primaryTo: pTo,
      extendedFrom: eFrom,
      extendedTo: eTo,
      companyName: companyName.trim(),
      prefix: prefix.trim(),
      kokoDateCol,
    });

    setResult(tallyResult);
  }, [dump2Rows, kokoRows, primaryFrom, primaryTo, extendedFrom, extendedTo, companyName, prefix]);

  // ---- Export results as multi-sheet Excel workbook ----
  const handleExport = useCallback(() => {
    if (!result) return;
    const today = new Date().toISOString().slice(0, 10);

    const allPairs = [...result.matched, ...result.extendedMatched];
    const samplePair = allPairs[0];
    const sampleKokoUnmatched = result.extendedUnmatchedKoko[0];
    const allDump2Unmatched = [...result.unmatchedDump2, ...result.extendedUnmatchedDump2];
    const sampleDump2Unmatched = allDump2Unmatched[0];

    const dump2Keys: string[] = samplePair
      ? Object.keys(samplePair.dump2Row)
      : sampleDump2Unmatched
      ? Object.keys(sampleDump2Unmatched)
      : [];
    const kokoKeys: string[] = samplePair
      ? Object.keys(samplePair.kokoRow)
      : sampleKokoUnmatched
      ? Object.keys(sampleKokoUnmatched)
      : [];

    const matchedHeaders = [
      "tally_range",
      ...dump2Keys.map((k) => `dump2_${k}`),
      ...kokoKeys.map((k) => `koko_${k}`),
    ];

    const makeMatchedRow = (range: string, m: { dump2Row: Record<string, string>; kokoRow: Record<string, string> }): Record<string, string> => {
      const r: Record<string, string> = { tally_range: range };
      dump2Keys.forEach((k) => (r[`dump2_${k}`] = m.dump2Row[k] ?? ""));
      kokoKeys.forEach((k) => (r[`koko_${k}`] = m.kokoRow[k] ?? ""));
      return r;
    };

    const matchedRows = [
      ...result.matched.map((m) => makeMatchedRow("primary", m)),
      ...result.extendedMatched.map((m) => makeMatchedRow("extended", m)),
    ];

    const unmatchedKokoHeaders = kokoKeys.length > 0 ? kokoKeys : (sampleKokoUnmatched ? Object.keys(sampleKokoUnmatched) : []);
    const unmatchedDump2Headers = dump2Keys.length > 0 ? dump2Keys : (sampleDump2Unmatched ? Object.keys(sampleDump2Unmatched) : []);

    downloadXLSX(
      [
        { name: "Matched", headers: matchedHeaders, rows: matchedRows },
        { name: "Unmatched Koko", headers: unmatchedKokoHeaders, rows: result.extendedUnmatchedKoko },
        { name: "Unmatched Dump2", headers: unmatchedDump2Headers, rows: allDump2Unmatched },
      ],
      `koko-tally-results-${today}.xlsx`
    );
  }, [result]);

  const totalKokoMatched = (result?.matched.length ?? 0) + (result?.extendedMatched.length ?? 0);
  const totalKokoUnmatched = result?.extendedUnmatchedKoko.length ?? 0;
  const totalKokoProcessed = totalKokoMatched + totalKokoUnmatched;

  return (
    <div className="space-y-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-6 shadow-[0_18px_40px_-28px_var(--primary)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reconciliation</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Koko Tally</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground sm:text-base">
              Reconcile Koko payment records against Dump 2 invoice data. Upload Dump 2, upload your Koko file, configure filters, and run the tally.
            </p>
          </div>
          {(dump2Rows || kokoRows || result) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              className="shrink-0 mt-1 bg-white/20 hover:bg-white/40 border-white/30 text-foreground backdrop-blur-sm"
            >
              <RotateCcw className="mr-2 size-4" />
              Reset
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Left column: data sources */}
        <div className="space-y-6">
          {/* Dump 2 upload */}
          <Card className="overflow-hidden border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),transparent)]">
              <CardTitle className="flex items-center gap-2 text-sky-800 dark:text-sky-200">
                <FileText className="size-5" />
                Step 1 — Upload Dump 2
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                First download Dump 2 from the{" "}
                <Link href="/dashboard/reports" className="underline underline-offset-2 hover:text-foreground">
                  Dump Reports
                </Link>{" "}
                page, then upload it here.
              </p>
              <div
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 transition-colors ${
                  dump2DragOver
                    ? "border-sky-500 bg-sky-50/60 dark:bg-sky-900/20"
                    : "border-border/70 bg-background/60 hover:border-sky-400/60 hover:bg-sky-50/30 dark:hover:bg-sky-900/10"
                }`}
                onClick={() => dump2FileRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && dump2FileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDump2DragOver(true); }}
                onDragLeave={() => setDump2DragOver(false)}
                onDrop={handleDump2Drop}
                role="button"
                tabIndex={0}
                aria-label="Upload Dump 2 CSV file"
              >
                <Download className="size-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">{dump2DragOver ? "Drop file here" : "Click or drag & drop Dump 2 CSV"}</p>
                  <p className="text-xs text-muted-foreground mt-1">CSV files only</p>
                </div>
                {dump2FileName && (
                  <p className="text-sm text-sky-600 dark:text-sky-400 font-medium">{dump2FileName}</p>
                )}
              </div>
              <input
                ref={dump2FileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleDump2File}
              />
              {dump2Rows && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  {dump2Rows.length.toLocaleString()} rows loaded
                </p>
              )}
              {dump2Error && (
                <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="size-4 shrink-0" />
                  {dump2Error}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Koko file upload */}
          <Card className="overflow-hidden border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,rgba(168,85,247,0.08),transparent)]">
              <CardTitle className="flex items-center gap-2 text-purple-800 dark:text-purple-200">
                <Upload className="size-5" />
                Step 2 — Upload Koko File
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                Upload the Koko payments CSV file. Must contain a{" "}
                <span className="font-mono text-xs">PRODUCT_VALUE</span> column and a{" "}
                <span className="font-mono text-xs">BRANCH_NAME</span> column.
              </p>
              <div
                className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-6 transition-colors ${
                  kokoDragOver
                    ? "border-purple-500 bg-purple-50/60 dark:bg-purple-900/20"
                    : "border-border/70 bg-background/60 hover:border-purple-400/60 hover:bg-purple-50/30 dark:hover:bg-purple-900/10"
                }`}
                onClick={() => kokoFileRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && kokoFileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setKokoDragOver(true); }}
                onDragLeave={() => setKokoDragOver(false)}
                onDrop={handleKokoDrop}
                role="button"
                tabIndex={0}
                aria-label="Upload Koko CSV file"
              >
                <Upload className="size-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium">{kokoDragOver ? "Drop file here" : "Click or drag & drop Koko CSV"}</p>
                  <p className="text-xs text-muted-foreground mt-1">CSV files only</p>
                </div>
                {kokoFileName && (
                  <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">{kokoFileName}</p>
                )}
              </div>
              <input
                ref={kokoFileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleKokoFile}
              />
              {kokoRows && (
                <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-4" />
                  {kokoRows.length.toLocaleString()} rows loaded
                </p>
              )}
              {kokoError && (
                <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="size-4 shrink-0" />
                  {kokoError}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: filters */}
        <Card className="overflow-hidden border-border/70 shadow-xs">
          <CardHeader className="border-b border-border/50 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),transparent)]">
            <CardTitle className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Calculator className="size-5" />
              Step 3 — Configure Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            {/* Primary date range */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Primary Date Range</label>
              <p className="text-xs text-muted-foreground">
                Records from both files are matched within this range first.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="primary-from" className="text-xs text-muted-foreground">From</label>
                  <Input
                    id="primary-from"
                    type="date"
                    value={primaryFrom}
                    onChange={(e) => setPrimaryFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="primary-to" className="text-xs text-muted-foreground">To</label>
                  <Input
                    id="primary-to"
                    type="date"
                    value={primaryTo}
                    onChange={(e) => setPrimaryTo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Extended date range */}
            <div className="space-y-2">
              <label className="text-sm font-semibold">Extended Date Range <span className="text-muted-foreground font-normal">(optional)</span></label>
              <p className="text-xs text-muted-foreground">
                If any Koko records remain unmatched after the primary range, this range is used as a fallback.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="ext-from" className="text-xs text-muted-foreground">From</label>
                  <Input
                    id="ext-from"
                    type="date"
                    value={extendedFrom}
                    onChange={(e) => setExtendedFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="ext-to" className="text-xs text-muted-foreground">To</label>
                  <Input
                    id="ext-to"
                    type="date"
                    value={extendedTo}
                    onChange={(e) => setExtendedTo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Company quick-fill dropdown */}
            {kokoCompanyOptions.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-semibold">Quick Fill <span className="text-muted-foreground font-normal">(optional)</span></label>
                <p className="text-xs text-muted-foreground">
                  Select a configured company to auto-fill the fields below.
                </p>
                <Select
                  value={selectedKokoId}
                  onValueChange={(val) => {
                    const option = kokoCompanyOptions.find((o) => o.id === val);
                    if (option) {
                      setSelectedKokoId(val);
                      setCompanyName(option.kokoName);
                      setPrefix(option.invoicePrefix);
                    }
                  }}
                >
                  <SelectTrigger className="border-border/70 bg-background/90">
                    <SelectValue placeholder="Select a company…" />
                  </SelectTrigger>
                  <SelectContent>
                    {kokoCompanyOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Company name */}
            <div className="space-y-2">
              <label htmlFor="company-name" className="text-sm font-semibold">Company Name</label>
              <p className="text-xs text-muted-foreground">
                Filters Koko records where the <span className="font-mono text-xs">BRANCH_NAME</span> column contains this value (case-insensitive). Auto-filled when a company is selected above.
              </p>
              <Input
                id="company-name"
                placeholder="e.g. Cosmetics LK"
                value={companyName}
                onChange={(e) => { setCompanyName(e.target.value); setSelectedKokoId(""); }}
              />
            </div>

            {/* Prefix */}
            <div className="space-y-2">
              <label htmlFor="prefix" className="text-sm font-semibold">Invoice Number Prefix</label>
              <p className="text-xs text-muted-foreground">
                Only Dump 2 records whose <span className="font-mono text-xs">invoice_no</span> starts with this prefix are included. E.g. <span className="font-mono text-xs">600</span> matches <span className="font-mono text-xs">60032078</span>.
              </p>
              <Input
                id="prefix"
                placeholder="e.g. 600"
                value={prefix}
                onChange={(e) => { setPrefix(e.target.value); setSelectedKokoId(""); }}
              />
            </div>

            {tallyError && (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                {tallyError}
              </p>
            )}

            <Button
              className="w-full bg-amber-500 text-white hover:bg-amber-600"
              onClick={handleTally}
              disabled={!dump2Rows || !kokoRows}
            >
              <Calculator className="mr-2 size-4" />
              Run Tally
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-emerald-200/60 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-900/10">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Matched (Primary)
                </p>
                <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
                  {result.matched.length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-sky-200/60 bg-sky-50/60 dark:border-sky-900/40 dark:bg-sky-900/10">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-sky-700 dark:text-sky-400">
                  Matched (Extended)
                </p>
                <p className="mt-1 text-2xl font-semibold text-sky-700 dark:text-sky-300">
                  {result.extendedMatched.length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-red-200/60 bg-red-50/60 dark:border-red-900/40 dark:bg-red-900/10">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-red-700 dark:text-red-400">
                  Unmatched Koko
                </p>
                <p className="mt-1 text-2xl font-semibold text-red-700 dark:text-red-300">
                  {result.extendedUnmatchedKoko.length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-amber-200/60 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  Unmatched Dump 2
                </p>
                <p className="mt-1 text-2xl font-semibold text-amber-700 dark:text-amber-300">
                  {result.unmatchedDump2.length + result.extendedUnmatchedDump2.length}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Progress bar */}
          {totalKokoProcessed > 0 && (
            <Card className="border-border/70 shadow-xs">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Tally Coverage</p>
                  <p className="text-sm text-muted-foreground">
                    {totalKokoMatched} / {totalKokoProcessed} Koko records matched (
                    {Math.round((totalKokoMatched / totalKokoProcessed) * 100)}%)
                  </p>
                </div>
                <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.round((totalKokoMatched / totalKokoProcessed) * 100)}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Export button */}
          <Card className="border-border/70 shadow-xs">
            <CardHeader className="border-b border-border/50">
              <CardTitle className="text-base">Export Results</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground mb-4">
                Downloads an Excel workbook with three sheets: <span className="font-mono text-xs">Matched</span>, <span className="font-mono text-xs">Unmatched Koko</span>, and <span className="font-mono text-xs">Unmatched Dump2</span>. Matched rows include a <span className="font-mono text-xs">tally_range</span> column (primary / extended).
              </p>
              <Button
                onClick={handleExport}
                className="bg-emerald-500 text-white hover:bg-emerald-600"
              >
                <Download className="mr-2 size-4" />
                Export to Excel (.xlsx)
              </Button>
            </CardContent>
          </Card>

          {/* Matched primary preview */}
          {result.matched.length > 0 && (
            <ResultTable
              title="Matched Records — Primary Range"
              color="emerald"
              rows={result.matched.map((m) => ({
                invoice_no: m.dump2Row["invoice_no"] ?? "",
                invoice_date: m.dump2Row["invoice_date"] ?? "",
                payment_gateway: m.dump2Row["payment_gateway"] ?? "",
                dump2_grand_total: m.dump2Amount.toFixed(2),
                koko_product_value: m.kokoAmount.toFixed(2),
                difference: (m.dump2Amount - m.kokoAmount).toFixed(2),
              }))}
              headers={["invoice_no", "invoice_date", "payment_gateway", "dump2_grand_total", "koko_product_value", "difference"]}
            />
          )}

          {/* Matched extended preview */}
          {result.extendedMatched.length > 0 && (
            <ResultTable
              title="Matched Records — Extended Range"
              color="sky"
              rows={result.extendedMatched.map((m) => ({
                invoice_no: m.dump2Row["invoice_no"] ?? "",
                invoice_date: m.dump2Row["invoice_date"] ?? "",
                payment_gateway: m.dump2Row["payment_gateway"] ?? "",
                dump2_grand_total: m.dump2Amount.toFixed(2),
                koko_product_value: m.kokoAmount.toFixed(2),
                difference: (m.dump2Amount - m.kokoAmount).toFixed(2),
              }))}
              headers={["invoice_no", "invoice_date", "payment_gateway", "dump2_grand_total", "koko_product_value", "difference"]}
            />
          )}

          {/* Unmatched Koko preview */}
          {result.extendedUnmatchedKoko.length > 0 && (
            <ResultTable
              title="Unmatched Koko Records"
              color="red"
              rows={result.extendedUnmatchedKoko.slice(0, 50)}
              headers={Object.keys(result.extendedUnmatchedKoko[0]).slice(0, 8)}
              note={result.extendedUnmatchedKoko.length > 50 ? `Showing first 50 of ${result.extendedUnmatchedKoko.length}. Export to see all.` : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result table sub-component
// ---------------------------------------------------------------------------

function ResultTable({
  title,
  color,
  rows,
  headers,
  note,
}: {
  title: string;
  color: "emerald" | "sky" | "red" | "amber";
  rows: Record<string, string>[];
  headers: string[];
  note?: string;
}) {
  const colorMap = {
    emerald: "text-emerald-800 dark:text-emerald-200 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),transparent)]",
    sky: "text-sky-800 dark:text-sky-200 bg-[linear-gradient(180deg,rgba(14,165,233,0.08),transparent)]",
    red: "text-red-800 dark:text-red-200 bg-[linear-gradient(180deg,rgba(239,68,68,0.08),transparent)]",
    amber: "text-amber-800 dark:text-amber-200 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),transparent)]",
  };

  return (
    <Card className="overflow-hidden border-border/70 shadow-xs">
      <CardHeader className={`border-b border-border/50 ${colorMap[color]}`}>
        <CardTitle className="text-base">{title}</CardTitle>
        {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                {headers.map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                >
                  {headers.map((h) => (
                    <td key={h} className="px-4 py-2 text-foreground whitespace-nowrap">
                      {row[h] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
