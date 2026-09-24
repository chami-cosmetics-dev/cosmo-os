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
import {
  BRAND_WAREHOUSE_VIOLATION_HEADERS,
  COSMETICS_STOCK_REPORT_HEADERS,
  type BrandWarehouseViolation,
  type CosmeticsStockReportDetail,
  type LocationStock,
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
  const [mainFilter, setMainFilter] = useState<MainFilter>("all");
  const [reportRows, setReportRows] = useState<CosmeticsStockReportDetail[]>([]);
  const [brandViolations, setBrandViolations] = useState<BrandWarehouseViolation[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const [lastLoad, setLastLoad] = useState<{
    threshold: number;
    itemCount: number;
    warehouseCount: number;
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

  const mainPager = usePagedRows(
    filteredRows,
    (row) => [row.SKU, row["Product Title"]],
    50,
  );
  const brandPager = usePagedRows(
    brandViolations,
    (row) => [row.SKU, row["Product Title"], row.Brand, row.Warehouse, row.Rule],
    50,
  );

  async function runReport() {
    const thresholdNumber = Number(threshold);
    if (!Number.isFinite(thresholdNumber)) {
      notify.error("Stock threshold must be a number");
      return;
    }

    setBusyKey("run-report");
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
      setMainFilter("all");
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
            Default threshold 0 = Cosmetics main empty. Other mains (not Cosmo main) show first, then
            shop floors. Critical marks top 90-day Cosmetics.lk / Shopify sellers.
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="main" disabled={isBusy}>
            Availability{hasRun ? ` (${reportRows.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="brand" disabled={isBusy}>
            Brand check{hasRun ? ` (${brandViolations.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="main" className="mt-4 space-y-3">
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
