"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  Loader2,
  PackageSearch,
  RefreshCw,
  Store,
  Warehouse,
} from "lucide-react";
import * as XLSX from "xlsx-js-style";

import { ListPager, usePagedRows } from "@/components/organisms/item-trends/list-pager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notify } from "@/lib/notify";
import { ERP_PRODUCT_PRIORITY_OPTIONS } from "@/lib/product-items/erp-priority-options";
import {
  BRAND_WAREHOUSE_VIOLATION_HEADERS,
  COSMETICS_STOCK_REPORT_HEADERS,
  matchesIdentityFilters,
  type BrandWarehouseViolation,
  type CosmeticsStockReportDetail,
  type FocusCompareRow,
  type LocationStock,
  type RopWatchRow,
  type ShopCompareRow,
  type WarehouseOption,
} from "@/lib/cosmetics-stock-comparer";

type LiveStockResponse = {
  threshold: number;
  ropPercent?: number | null;
  focusWarehouse?: string | null;
  itemCount: number;
  warehouseCount: number;
  watchedWarehouseCount?: number;
  warehouses?: WarehouseOption[];
  salesWindow?: { from: string; to: string; timezone: string; days: number } | null;
  salesStatus?: "ok" | "unavailable";
  criticalCutoffUnits?: number | null;
  rows: CosmeticsStockReportDetail[];
  brandViolations: BrandWarehouseViolation[];
  ropWatch?: RopWatchRow[];
  shopCompare?: ShopCompareRow[];
  focusCompare?: FocusCompareRow[];
  error?: string;
  detail?: string;
};

type MainFilter = "all" | "critical" | "elsewhere" | "none";

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

function LocationPills({
  items,
  empty,
}: {
  items: LocationStock[];
  empty: string;
}) {
  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">{empty}</span>;
  }
  return (
    <ul className="flex max-w-56 flex-col gap-1">
      {items.map((item) => (
        <li
          key={`${item.kind}-${item.warehouse}`}
          className="flex items-center justify-between gap-2 rounded-md bg-muted/70 px-2 py-1 text-xs"
        >
          <span className="min-w-0 truncate" title={item.name}>
            {item.name}
          </span>
          <span className="shrink-0 font-semibold tabular-nums">{item.qty}</span>
        </li>
      ))}
    </ul>
  );
}

function StatButton({
  label,
  value,
  hint,
  active,
  onClick,
  disabled,
}: {
  label: string;
  value: number;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"
      } disabled:pointer-events-none disabled:opacity-60`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </button>
  );
}

function exportRows(filename: string, headers: string[], rows: Array<Array<string | number>>) {
  const workbook = XLSX.utils.book_new();
  const sheetRows = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: Math.max(sheetRows.length - 1, 0), c: Math.max(headers.length - 1, 0) },
    }),
  };
  XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `${filename}-${today}.xlsx`);
}

function formatPercent(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "";
  return `${Math.round(ratio * 1000) / 10}%`;
}

function locationText(items: LocationStock[]): string {
  return items.map((item) => `${item.name} (${item.qty})`).join(", ");
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof PackageSearch;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-16 text-center">
      <Icon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function CosmeticsStockComparer() {
  const [tab, setTab] = useState("main");
  const [threshold, setThreshold] = useState("0");
  const [ropPercentInput, setRopPercentInput] = useState("");
  const [focusWarehouse, setFocusWarehouse] = useState("");
  const [commonSku, setCommonSku] = useState("");
  const [variantSku, setVariantSku] = useState("");
  const [priority, setPriority] = useState("");
  const [vatStatus, setVatStatus] = useState("");
  const [mainFilter, setMainFilter] = useState<MainFilter>("all");
  const [reportRows, setReportRows] = useState<CosmeticsStockReportDetail[]>([]);
  const [brandViolations, setBrandViolations] = useState<BrandWarehouseViolation[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [ropWatch, setRopWatch] = useState<RopWatchRow[]>([]);
  const [shopCompare, setShopCompare] = useState<ShopCompareRow[]>([]);
  const [focusCompare, setFocusCompare] = useState<FocusCompareRow[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [lastLoad, setLastLoad] = useState<{
    threshold: number;
    ropPercent: number | null;
    itemCount: number;
    warehouseCount: number;
    watchedWarehouseCount: number;
    salesStatus: "ok" | "unavailable";
    salesWindow: LiveStockResponse["salesWindow"];
  } | null>(null);

  const isBusy = busyKey !== null;

  const availableCount = reportRows.filter((row) => row["Stock Available Elsewhere"] === "Yes").length;
  const criticalCount = reportRows.filter((row) => row.critical).length;
  const noneCount = reportRows.length - availableCount;

  const filteredRows = useMemo(() => {
    if (mainFilter === "critical") return reportRows.filter((row) => row.critical);
    if (mainFilter === "elsewhere") {
      return reportRows.filter((row) => row["Stock Available Elsewhere"] === "Yes");
    }
    if (mainFilter === "none") {
      return reportRows.filter((row) => row["Stock Available Elsewhere"] === "No");
    }
    return reportRows;
  }, [mainFilter, reportRows]);

  const identityFilter = useMemo(
    () => ({ commonSku, variantSku, priority, vatStatus }),
    [commonSku, priority, variantSku, vatStatus],
  );
  const filteredWatch = useMemo(
    () => ropWatch.filter((row) => matchesIdentityFilters(row, identityFilter)),
    [identityFilter, ropWatch],
  );
  const filteredShops = useMemo(
    () => shopCompare.filter((row) => matchesIdentityFilters(row, identityFilter)),
    [identityFilter, shopCompare],
  );
  const filteredFocus = useMemo(
    () => focusCompare.filter((row) => matchesIdentityFilters(row, identityFilter)),
    [focusCompare, identityFilter],
  );
  const priorityOptions = useMemo(() => {
    const values = new Set<string>(ERP_PRODUCT_PRIORITY_OPTIONS);
    for (const row of [...ropWatch, ...shopCompare, ...focusCompare]) {
      if (row.erp1ProductPriority) values.add(row.erp1ProductPriority);
      if (row.erp2ProductPriority) values.add(row.erp2ProductPriority);
    }
    return [...values].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  }, [focusCompare, ropWatch, shopCompare]);
  const vatOptions = useMemo(() => {
    const values = new Set<string>();
    for (const row of [...ropWatch, ...shopCompare, ...focusCompare]) {
      if (row.vatStatus.trim()) values.add(row.vatStatus.trim());
    }
    return [...values].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  }, [focusCompare, ropWatch, shopCompare]);

  const mainPager = usePagedRows(
    filteredRows,
    (row) => [row.SKU, row["Product Title"]],
    50,
  );
  const watchPager = usePagedRows(
    filteredWatch,
    (row) => [row.SKU, row.commonSku, row["Product Title"]],
    50,
  );
  const shopPager = usePagedRows(
    filteredShops,
    (row) => [row.SKU, row.commonSku, row["Product Title"], ...row.shops.map((shop) => shop.name)],
    50,
  );
  const focusPager = usePagedRows(
    filteredFocus,
    (row) => [row.SKU, row.commonSku, row["Product Title"], row.focusWarehouse],
    50,
  );
  const brandPager = usePagedRows(
    brandViolations,
    (row) => [row.SKU, row["Product Title"], row.Brand, row.Warehouse, row.Rule],
    50,
  );

  function clearReport() {
    setReportRows([]);
    setBrandViolations([]);
    setRopWatch([]);
    setShopCompare([]);
    setFocusCompare([]);
    setWarehouses([]);
    setHasRun(false);
    setLastLoad(null);
  }

  async function runReport() {
    const thresholdNumber = Number(threshold);
    if (!Number.isFinite(thresholdNumber)) {
      notify.error("Stock threshold must be a number");
      return;
    }
    const rawPercent = ropPercentInput.trim();
    let ropPercentNumber: number | null = null;
    if (rawPercent !== "") {
      ropPercentNumber = Number(rawPercent);
      if (!Number.isFinite(ropPercentNumber) || ropPercentNumber < 0 || ropPercentNumber > 100) {
        notify.error("Reorder percent must be a number from 0 through 100");
        return;
      }
    }
    if (tab === "compare" && focusWarehouse && ropPercentNumber == null) {
      notify.error("Enter a reorder percent from 0 through 100");
      return;
    }
    if (tab === "compare" && warehouses.length > 0 && !focusWarehouse) {
      notify.error("Select a warehouse to compare");
      return;
    }

    setBusyKey("run-report");
    try {
      const params = new URLSearchParams({ threshold: String(thresholdNumber) });
      if (ropPercentNumber != null) params.set("ropPercent", String(ropPercentNumber));
      if (ropPercentNumber != null && focusWarehouse) params.set("focusWarehouse", focusWarehouse);
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
      setWarehouses(data.warehouses ?? []);
      setRopWatch(data.ropWatch ?? []);
      setShopCompare(data.shopCompare ?? []);
      setFocusCompare(data.focusCompare ?? []);
      setHasRun(true);
      setMainFilter("all");
      setLastLoad({
        threshold: data.threshold ?? thresholdNumber,
        ropPercent: data.ropPercent ?? null,
        itemCount: data.itemCount ?? 0,
        warehouseCount: data.warehouseCount ?? 0,
        watchedWarehouseCount: data.watchedWarehouseCount ?? 0,
        salesStatus: data.salesStatus === "unavailable" ? "unavailable" : "ok",
        salesWindow: data.salesWindow ?? null,
      });
      notify.success(`Report ready for ${data.itemCount ?? 0} SKU(s)`);
    } catch (err) {
      clearReport();
      notify.error(err instanceof Error ? err.message : "Could not run report");
    } finally {
      setBusyKey(null);
    }
  }

  function applyMainFilter(next: MainFilter) {
    setTab("main");
    setMainFilter(next);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-base">Live stock run</CardTitle>
          <CardDescription>
            Threshold 0 lists an empty Cosmetics main. Reorder percent lists items at or below that
            share of each watched warehouse’s reorder point (Cosmetics main and the other company’s
            non-shop warehouses). Empty Cosmetics main means cosmetics.lk is out of stock.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-0 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium">
              Threshold
              <Input
                className="mt-1 w-28"
                type="number"
                step="any"
                min={0}
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runReport();
                }}
                disabled={isBusy}
              />
            </label>
            <label className="text-sm font-medium">
              Reorder %
              <Input
                className="mt-1 w-28"
                type="number"
                step="any"
                min={0}
                max={100}
                value={ropPercentInput}
                placeholder="30"
                onChange={(event) => setRopPercentInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runReport();
                }}
                disabled={isBusy}
              />
            </label>
            <label className="text-sm font-medium">
              Compare warehouse
              <select
                className="mt-1 h-9 w-56 rounded-md border bg-background px-2 text-sm"
                value={focusWarehouse}
                onChange={(event) => setFocusWarehouse(event.target.value)}
                disabled={isBusy || warehouses.length === 0}
              >
                <option value="">Select after a run</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.name} value={warehouse.name}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" onClick={() => void runReport()} disabled={isBusy} className="gap-2">
              {busyKey === "run-report" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {busyKey === "run-report" ? "Running..." : "Run report"}
            </Button>
          </div>
          <div className="max-w-md text-xs text-muted-foreground">
            {lastLoad ? (
              <>
                Last run threshold <span className="font-medium text-foreground">{lastLoad.threshold}</span>
                {lastLoad.ropPercent != null ? (
                  <>
                    {" · "}
                    reorder <span className="font-medium text-foreground">{lastLoad.ropPercent}%</span>
                    {" · "}
                    {lastLoad.watchedWarehouseCount} watched warehouses
                  </>
                ) : null}
                {" · "}
                {lastLoad.warehouseCount} warehouses · {lastLoad.itemCount} catalog SKUs
                {lastLoad.salesWindow
                  ? ` · sales ${lastLoad.salesWindow.from}–${lastLoad.salesWindow.to}`
                  : ""}
                {lastLoad.salesStatus === "unavailable"
                  ? " · sales ranking unavailable (no Critical badges)"
                  : ""}
              </>
            ) : (
              "No run yet. Results stay until you run again."
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatButton
          label="Flagged SKUs"
          value={reportRows.length}
          hint="At or below last-run threshold"
          active={tab === "main" && mainFilter === "all"}
          onClick={() => applyMainFilter("all")}
          disabled={!hasRun}
        />
        <StatButton
          label="Stock elsewhere"
          value={availableCount}
          hint="Can pull from online or shops"
          active={tab === "main" && mainFilter === "elsewhere"}
          onClick={() => applyMainFilter("elsewhere")}
          disabled={!hasRun}
        />
        <StatButton
          label="Critical"
          value={criticalCount}
          hint="Top 20% of 90-day sellers"
          active={tab === "main" && mainFilter === "critical"}
          onClick={() => applyMainFilter("critical")}
          disabled={!hasRun}
        />
        <StatButton
          label="Brand issues"
          value={brandViolations.length}
          hint="Wrong-company stock"
          active={tab === "brand"}
          onClick={() => setTab("brand")}
          disabled={!hasRun}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm font-medium">
          Common SKU
          <Input
            className="mt-1 w-36"
            value={commonSku}
            onChange={(event) => setCommonSku(event.target.value)}
            disabled={isBusy}
            placeholder="CAN07"
          />
        </label>
        <label className="text-sm font-medium">
          Variant SKU
          <Input
            className="mt-1 w-36"
            value={variantSku}
            onChange={(event) => setVariantSku(event.target.value)}
            disabled={isBusy}
            placeholder="CAN07_1"
          />
        </label>
        <label className="text-sm font-medium">
          Priority
          <select
            className="mt-1 h-9 w-40 rounded-md border bg-background px-2 text-sm"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            disabled={isBusy}
          >
            <option value="">Any</option>
            {priorityOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          VAT
          <select
            className="mt-1 h-9 w-40 rounded-md border bg-background px-2 text-sm"
            value={vatStatus}
            onChange={(event) => setVatStatus(event.target.value)}
            disabled={isBusy}
          >
            <option value="">Any</option>
            {vatOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={isBusy || (!commonSku && !variantSku && !priority && !vatStatus)}
          onClick={() => {
            setCommonSku("");
            setVariantSku("");
            setPriority("");
            setVatStatus("");
          }}
        >
          Clear filters
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="main" disabled={isBusy}>
            Availability{hasRun ? ` (${reportRows.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="shops" disabled={isBusy}>
            Shops{hasRun ? ` (${filteredShops.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="compare" disabled={isBusy}>
            Compare{hasRun ? ` (${filteredFocus.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="brand" disabled={isBusy}>
            Brand check{hasRun ? ` (${brandViolations.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="main" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              Reorder watch
              {lastLoad?.ropPercent != null ? ` at ${lastLoad.ropPercent}%` : ""}
              {hasRun ? ` (${filteredWatch.length})` : ""}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                exportRows(
                  "cosmetics-rop-watch",
                  ["SKU", "Common SKU", "Product Title", "Warehouse", "Qty", "ROP", "% of ROP", "Website OOS", "Priority", "VAT", "Elsewhere"],
                  filteredWatch.flatMap((row) =>
                    row.hits.map((hit) => [
                      row.SKU,
                      row.commonSku,
                      row["Product Title"],
                      hit.warehouse,
                      hit.qty,
                      hit.rop ?? "",
                      formatPercent(hit.percentOfRop),
                      hit.websiteOutOfStock ? "Yes" : "",
                      [row.erp1ProductPriority, row.erp2ProductPriority].filter(Boolean).join(" / "),
                      row.vatStatus,
                      locationText(row.elsewhere),
                    ]),
                  ),
                )
              }
              disabled={isBusy || filteredWatch.length === 0}
              className="gap-2"
            >
              <Download className="size-4" />
              Export reorder watch
            </Button>
          </div>
          {!hasRun || lastLoad?.ropPercent == null ? (
            <EmptyState
              icon={PackageSearch}
              title="Enter a reorder percent and run"
              detail="Example: 30 lists items whose stock is 30% of that warehouse’s reorder point or less. Reorder point 100 includes stock 30 and leaves out 31."
            />
          ) : filteredWatch.length === 0 ? (
            <EmptyState
              icon={Warehouse}
              title="No reorder-point hits"
              detail="Nothing is at or below that percent on Cosmetics main or the other company’s non-shop warehouses. Missing reorder points are not listed."
            />
          ) : (
            <Card className="gap-0 py-4">
              <CardContent className="px-4">
                <ListPager
                  query={watchPager.query}
                  onQueryChange={watchPager.setQuery}
                  page={watchPager.page}
                  pageCount={watchPager.pageCount}
                  total={watchPager.total}
                  from={watchPager.from}
                  to={watchPager.to}
                  onPage={watchPager.setPage}
                  searchPlaceholder="Search SKU or title…"
                />
                <div className="max-h-[32rem] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead className="min-w-56">Item</TableHead>
                        <TableHead>Watched hit</TableHead>
                        <TableHead className="w-20 text-right">Qty</TableHead>
                        <TableHead className="w-20 text-right">ROP</TableHead>
                        <TableHead className="w-24 text-right">% of ROP</TableHead>
                        <TableHead>Elsewhere</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {watchPager.slice.map((row) => (
                        <TableRow key={row.SKU}>
                          <TableCell className="whitespace-normal align-top">
                            <p className="font-medium">{row.SKU}</p>
                            <p className="text-xs text-muted-foreground">{row.commonSku}</p>
                            <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">{row["Product Title"]}</p>
                          </TableCell>
                          <TableCell className="whitespace-normal align-top">
                            {row.hits.map((hit) => (
                              <p key={`${hit.warehouse}-${hit.role}`} className="text-sm">
                                {hit.label}
                                {hit.websiteOutOfStock ? (
                                  <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-800 dark:bg-red-950 dark:text-red-200">
                                    cosmetics.lk out of stock
                                  </span>
                                ) : null}
                              </p>
                            ))}
                            {row.context.filter((item) => item.ropMissing).map((item) => (
                              <p key={item.warehouse} className="text-xs text-muted-foreground">
                                {item.label}: reorder point missing
                              </p>
                            ))}
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums">
                            {row.hits.map((hit) => (
                              <p key={`${hit.warehouse}-qty`}>{hit.qty}</p>
                            ))}
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums">
                            {row.hits.map((hit) => (
                              <p key={`${hit.warehouse}-rop`}>{hit.rop ?? "—"}</p>
                            ))}
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums">
                            {row.hits.map((hit) => (
                              <p key={`${hit.warehouse}-pct`}>{formatPercent(hit.percentOfRop) || "—"}</p>
                            ))}
                          </TableCell>
                          <TableCell className="whitespace-normal align-top">
                            <LocationPills items={row.elsewhere} empty="None" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["all", "All", reportRows.length],
                  ["critical", "Critical", criticalCount],
                  ["elsewhere", "Elsewhere", availableCount],
                  ["none", "None elsewhere", noneCount],
                ] as const
              ).map(([key, label, count]) => (
                <Button
                  key={key}
                  type="button"
                  size="sm"
                  variant={mainFilter === key ? "default" : "outline"}
                  disabled={isBusy || !hasRun}
                  onClick={() => setMainFilter(key)}
                >
                  {label} ({count})
                </Button>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => exportStockReport(reportRows)}
              disabled={isBusy || reportRows.length === 0}
              className="gap-2"
            >
              <Download className="size-4" />
              Export stock report
            </Button>
          </div>

          {!hasRun ? (
            <EmptyState
              icon={PackageSearch}
              title="Run the report to see shortages"
              detail="Items at or below Cosmetics main threshold appear here, with other main warehouses listed before shops."
            />
          ) : filteredRows.length === 0 ? (
            <EmptyState
              icon={Warehouse}
              title="No items in this view"
              detail={
                reportRows.length === 0
                  ? `Nothing at or below threshold ${lastLoad?.threshold ?? threshold}.`
                  : "Try another filter or search."
              }
            />
          ) : (
            <Card className="gap-0 py-4">
              <CardContent className="px-4">
                <ListPager
                  query={mainPager.query}
                  onQueryChange={mainPager.setQuery}
                  page={mainPager.page}
                  pageCount={mainPager.pageCount}
                  total={mainPager.total}
                  from={mainPager.from}
                  to={mainPager.to}
                  onPage={mainPager.setPage}
                  searchPlaceholder="Search SKU or title…"
                />
                <div className="max-h-[32rem] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead className="min-w-56">Item</TableHead>
                        <TableHead className="w-24 text-right">Main</TableHead>
                        <TableHead className="w-24 text-right">90d sales</TableHead>
                        <TableHead className="min-w-44">
                          <span className="inline-flex items-center gap-1">
                            <Warehouse className="size-3.5" aria-hidden />
                            Other mains
                          </span>
                        </TableHead>
                        <TableHead className="min-w-44">
                          <span className="inline-flex items-center gap-1">
                            <Store className="size-3.5" aria-hidden />
                            Shops
                          </span>
                        </TableHead>
                        <TableHead className="w-28">Elsewhere</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mainPager.slice.map((row) => (
                        <TableRow key={row.SKU} className={row.critical ? "bg-red-50/40 dark:bg-red-950/20" : undefined}>
                          <TableCell className="whitespace-normal align-top">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-medium">{row.SKU}</span>
                              {row.critical ? (
                                <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800 dark:bg-red-950 dark:text-red-200">
                                  Critical
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 max-w-xs text-xs text-muted-foreground">
                              {row["Product Title"]}
                            </p>
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums font-semibold">
                            {row["Main Warehouse Qty"]}
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums">
                            {row.sales90d}
                          </TableCell>
                          <TableCell className="whitespace-normal align-top">
                            <LocationPills items={row.online} empty="None" />
                          </TableCell>
                          <TableCell className="whitespace-normal align-top">
                            <LocationPills items={row.shops} empty="None" />
                          </TableCell>
                          <TableCell className="align-top">
                            {row["Stock Available Elsewhere"] === "Yes" ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                Yes
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                No
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="shops" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={isBusy || filteredShops.length === 0}
              onClick={() =>
                exportRows(
                  "cosmetics-shop-compare",
                  ["SKU", "Common SKU", "Product Title", "Main Qty", "Website OOS", "Shop", "Shop Qty"],
                  filteredShops.flatMap((row) => {
                    const shops = row.shops.length > 0 ? row.shops : [{ name: "", qty: "" as const, kind: "shop" as const, warehouse: "" }];
                    return shops.map((shop, index) => [
                      index === 0 ? row.SKU : "",
                      index === 0 ? row.commonSku : "",
                      index === 0 ? row["Product Title"] : "",
                      index === 0 ? (row.mainQty ?? "") : "",
                      index === 0 ? (row.websiteOutOfStock ? "Yes" : "") : "",
                      shop.name,
                      shop.qty,
                    ]);
                  }),
                )
              }
            >
              <Download className="size-4" />
              Export shops
            </Button>
          </div>
          {!hasRun ? (
            <EmptyState icon={Store} title="Run the report to compare shops" detail="Cosmetics main quantity sits beside each shop that has stock." />
          ) : filteredShops.length === 0 ? (
            <EmptyState icon={Store} title="No shop rows" detail="Nothing is at the main threshold or at or below the reorder percent on Cosmetics main." />
          ) : (
            <Card className="gap-0 py-4">
              <CardContent className="px-4">
                <ListPager
                  query={shopPager.query}
                  onQueryChange={shopPager.setQuery}
                  page={shopPager.page}
                  pageCount={shopPager.pageCount}
                  total={shopPager.total}
                  from={shopPager.from}
                  to={shopPager.to}
                  onPage={shopPager.setPage}
                  searchPlaceholder="Search SKU, title, or shop…"
                />
                <div className="max-h-[32rem] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="w-24 text-right">Main</TableHead>
                        <TableHead>Shops</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {shopPager.slice.map((row) => (
                        <TableRow key={row.SKU}>
                          <TableCell className="whitespace-normal align-top">
                            <p className="font-medium">{row.SKU}</p>
                            <p className="max-w-xs text-xs text-muted-foreground">{row["Product Title"]}</p>
                          </TableCell>
                          <TableCell className="align-top text-right tabular-nums font-semibold">
                            {row.mainQty ?? "—"}
                            {row.websiteOutOfStock ? (
                              <p className="text-[10px] font-semibold uppercase text-red-700">cosmetics.lk out of stock</p>
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-normal align-top">
                            <LocationPills items={row.shops} empty="No shop stock" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="compare" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              disabled={isBusy || filteredFocus.length === 0}
              onClick={() =>
                exportRows(
                  "cosmetics-warehouse-compare",
                  ["SKU", "Common SKU", "Product Title", "Focus", "Qty", "ROP", "% of ROP", "Elsewhere"],
                  filteredFocus.map((row) => [
                    row.SKU,
                    row.commonSku,
                    row["Product Title"],
                    row.focusWarehouse,
                    row.qty,
                    row.rop ?? "",
                    formatPercent(row.percentOfRop),
                    locationText(row.elsewhere),
                  ]),
                )
              }
            >
              <Download className="size-4" />
              Export compare
            </Button>
          </div>
          {!hasRun || lastLoad?.ropPercent == null ? (
            <EmptyState
              icon={Warehouse}
              title="Pick a warehouse and a reorder percent"
              detail="Run again after choosing a warehouse. The list is items at or below that percent of the chosen warehouse’s reorder point."
            />
          ) : filteredFocus.length === 0 ? (
            <EmptyState
              icon={Warehouse}
              title="No items for this warehouse"
              detail="Nothing is at or below the percent, or this warehouse has no reorder point. The chosen warehouse is not repeated as elsewhere."
            />
          ) : (
            <Card className="gap-0 py-4">
              <CardContent className="px-4">
                <ListPager
                  query={focusPager.query}
                  onQueryChange={focusPager.setQuery}
                  page={focusPager.page}
                  pageCount={focusPager.pageCount}
                  total={focusPager.total}
                  from={focusPager.from}
                  to={focusPager.to}
                  onPage={focusPager.setPage}
                  searchPlaceholder="Search SKU or title…"
                />
                <div className="max-h-[32rem] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Focus</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">ROP</TableHead>
                        <TableHead className="text-right">% of ROP</TableHead>
                        <TableHead>Elsewhere</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {focusPager.slice.map((row) => (
                        <TableRow key={row.SKU}>
                          <TableCell className="whitespace-normal align-top">
                            <p className="font-medium">{row.SKU}</p>
                            <p className="max-w-xs text-xs text-muted-foreground">{row["Product Title"]}</p>
                          </TableCell>
                          <TableCell className="align-top">{row.focusWarehouse}</TableCell>
                          <TableCell className="align-top text-right tabular-nums">{row.qty}</TableCell>
                          <TableCell className="align-top text-right tabular-nums">{row.rop ?? "—"}</TableCell>
                          <TableCell className="align-top text-right tabular-nums">{formatPercent(row.percentOfRop) || "—"}</TableCell>
                          <TableCell className="whitespace-normal align-top">
                            <LocationPills items={row.elsewhere} empty="None" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="brand" className="mt-4 space-y-3">
          <div className="flex justify-end">
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
          </div>

          {!hasRun ? (
            <EmptyState
              icon={AlertTriangle}
              title="Run the report to check brands"
              detail="Company 1-only and Company 2-only brands appear here when they have stock on the wrong company."
            />
          ) : brandViolations.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No brand violations"
              detail="Restricted brands only appear on their allowed company in this run."
            />
          ) : (
            <Card className="gap-0 py-4">
              <CardContent className="px-4">
                <ListPager
                  query={brandPager.query}
                  onQueryChange={brandPager.setQuery}
                  page={brandPager.page}
                  pageCount={brandPager.pageCount}
                  total={brandPager.total}
                  from={brandPager.from}
                  to={brandPager.to}
                  onPage={brandPager.setPage}
                  searchPlaceholder="Search brand, SKU, warehouse…"
                />
                <div className="max-h-[32rem] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Warehouse</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Rule</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brandPager.slice.map((row, index) => (
                        <TableRow key={`${row.SKU}-${row.Warehouse}-${index}`}>
                          <TableCell className="whitespace-normal align-top">
                            <p className="font-medium">{row.SKU}</p>
                            <p className="max-w-xs text-xs text-muted-foreground">{row["Product Title"]}</p>
                          </TableCell>
                          <TableCell className="align-top font-medium">{row.Brand}</TableCell>
                          <TableCell className="align-top">{row["ERP Source"]}</TableCell>
                          <TableCell className="whitespace-normal align-top">{row.Warehouse}</TableCell>
                          <TableCell className="align-top text-right tabular-nums">
                            {row["Balance Qty"]}
                          </TableCell>
                          <TableCell className="whitespace-normal align-top text-xs text-muted-foreground">
                            {row.Rule}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
