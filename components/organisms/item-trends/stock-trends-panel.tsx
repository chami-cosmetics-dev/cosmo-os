"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartLine, Clock, Loader2, RotateCw, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

import {
  StockTrendChart,
  StockTrendMultiChart,
  VARIANT_COLORS,
  type VariantSeriesLine,
} from "@/components/organisms/item-trends/stock-trend-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { SortableColumnHeader } from "@/components/ui/sortable-column-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { buildStockTrendsCsv, downloadCsv } from "@/lib/item-trends/export";
import { notify } from "@/lib/notify";
import { parentSkuStem } from "@/lib/item-trends/sku-group";
import type { MovementStatus } from "@/lib/item-trends/stock-trend-movement";
import {
  EARLY_AGE_DAYS,
  FAST_MOVER_SELL_THROUGH_PCT,
  STOCK_TRENDS_DEFAULT_RANGE_MONTHS,
} from "@/lib/item-trends/stock-trends-config";
import { cn } from "@/lib/utils";
import type {
  StockChannel,
  StockTrendItemInfo,
  StockTrendItemRow,
  StockTrendSeriesPoint,
  StockTrendVariantSeries,
} from "@/lib/item-trends/stock-trends";

/** Palette can distinguish at most this many variant lines at once (dataviz skill's categorical-palette limit). */
const MAX_PLOTTED_VARIANTS = 8;

/** currentStock is the live report balance — can differ from the last series point (the series excludes transfers/adjustments). */
type VariantSeriesData = StockTrendVariantSeries;

/** A top filter that hides the Trend view's searched SKU from the table, with a one-click fix. */
type TrendFilterIssue = { key: string; message: string; fixLabel: string | null; onFix: (() => void) | null };
type MergedRow = { ts: number; date: string; total: number; [variantSku: string]: number | string | undefined };

const PAGE_SIZE_OPTIONS = [20, 50, 100];
const SEARCH_DEBOUNCE_MS = 400;
const GRANULARITY_OPTIONS = ["day", "week", "month", "year"] as const;
type Granularity = (typeof GRANULARITY_OPTIONS)[number];

function defaultCreatedDateTo(): string {
  return formatAppIsoDate(new Date());
}

function defaultCreatedDateFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - STOCK_TRENDS_DEFAULT_RANGE_MONTHS);
  return formatAppIsoDate(d);
}

type MovementFilter = "all" | "fast" | "slow" | "early";
type TableSortKey = "ageDays" | "sellThroughPct";

/**
 * Movement badge styling — deliberately blue / grey / purple / muted so it never
 * competes with the red / amber / green already used for Current stock.
 */
const MOVEMENT_DISPLAY: Record<
  MovementStatus,
  { label: string; icon: LucideIcon | null; className: string; rule: string }
> = {
  fast: {
    label: "Fast mover",
    icon: TrendingUp,
    className: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    rule: `sell-through ≥ ${FAST_MOVER_SELL_THROUGH_PCT}%`,
  },
  slow: {
    label: "Slow mover",
    icon: TrendingDown,
    className: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
    rule: `sell-through below ${FAST_MOVER_SELL_THROUGH_PCT}%`,
  },
  early: {
    label: "Early",
    icon: Clock,
    className: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    rule: `created less than ${EARLY_AGE_DAYS} days ago (too new to judge)`,
  },
  na: {
    label: "N/A",
    icon: null,
    className: "bg-muted text-muted-foreground",
    rule: "no purchase receipts recorded",
  },
};

const MOVEMENT_FILTER_OPTIONS: { value: MovementFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "fast", label: "Fast" },
  { value: "slow", label: "Slow" },
  { value: "early", label: "Early" },
];

function MovementBadge({ status }: { status: MovementStatus }) {
  const display = MOVEMENT_DISPLAY[status];
  const Icon = display.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium",
        display.className,
      )}
    >
      {Icon ? <Icon className="size-3" aria-hidden /> : null}
      {display.label}
    </span>
  );
}

/**
 * Priority label colours. Avoids red/amber/green (Current stock) and
 * blue/grey/purple (Movement). Known priorities are pinned; any new ERP value
 * gets a stable colour from the rest of the palette by hashing its name.
 */
// Strong fill + ring + high-contrast text so each label reads clearly in both themes.
const PRIORITY_LABEL_PALETTE = [
  "bg-pink-500/25 text-pink-800 ring-pink-500/60 dark:bg-pink-400/25 dark:text-pink-100",
  "bg-cyan-500/25 text-cyan-800 ring-cyan-500/60 dark:bg-cyan-400/25 dark:text-cyan-100",
  "bg-orange-500/25 text-orange-800 ring-orange-500/60 dark:bg-orange-400/25 dark:text-orange-100",
  "bg-indigo-500/25 text-indigo-800 ring-indigo-500/60 dark:bg-indigo-400/30 dark:text-indigo-100",
  "bg-fuchsia-500/25 text-fuchsia-800 ring-fuchsia-500/60 dark:bg-fuchsia-400/25 dark:text-fuchsia-100",
  "bg-teal-500/25 text-teal-800 ring-teal-500/60 dark:bg-teal-400/25 dark:text-teal-100",
];

/**
 * Known priorities get their own palette slot (matched loosely, since ERP
 * spellings vary — "Discontinue"/"Discontinued", "New"/"Newly Added").
 */
const PRIORITY_LABEL_PINNED: { matches: (key: string) => boolean; slot: number }[] = [
  { matches: (k) => k === "top", slot: 0 },
  { matches: (k) => k === "low", slot: 1 },
  { matches: (k) => k.startsWith("discontinu"), slot: 2 },
  { matches: (k) => k.startsWith("new"), slot: 3 },
];

function priorityLabelClass(priority: string): string {
  const key = priority.trim().toLowerCase();
  const pinned = PRIORITY_LABEL_PINNED.find((p) => p.matches(key));
  if (pinned) return PRIORITY_LABEL_PALETTE[pinned.slot];
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  // Unknown priorities only use the unpinned slots, so they never look like a known one.
  const firstFree = PRIORITY_LABEL_PINNED.length;
  return PRIORITY_LABEL_PALETTE[firstFree + (hash % (PRIORITY_LABEL_PALETTE.length - firstFree))];
}

/** Rounded sell-through %, or "—" with an explanation when nothing was purchased. */
function SellThroughCell({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help text-muted-foreground">—</span>
        </TooltipTrigger>
        <TooltipContent>No purchase receipts recorded</TooltipContent>
      </Tooltip>
    );
  }
  return <span className="tabular-nums">{Math.round(pct)}%</span>;
}

/** Debounces free-typed text so we don't refetch on every keystroke. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Header row stays visible under the 4rem sticky topbar while the page scrolls past the table. */
const STICKY_TABLE_HEADER_CLASS = "sticky top-16 z-20 bg-card shadow-[0_1px_0_var(--border)]";

/**
 * Test SKUs that stay in the table/export but are never auto-picked as the
 * Trend view's default item — the next row is charted instead. They can
 * still be charted by typing the SKU.
 */
const TREND_DEFAULT_EXCLUDED_SKUS = new Set(["Test_1-1"]);

/**
 * Table headers wrap onto multiple lines so each column is only as wide as its
 * data (TableHead is nowrap by default), keeping the table compact and tidy.
 */
const WRAPPED_HEAD_CLASS = "h-auto whitespace-normal py-2 text-center leading-tight";
const WRAPPED_SORTABLE_HEAD_CLASS = "h-auto whitespace-normal px-2 py-2 leading-tight";

/** Highest current stock that still counts as "low" (yellow). */
const LOW_STOCK_MAX = 25;

type StockBand = "red" | "yellow" | "green";

/**
 * Current stock colour bands — one source for the cell colour, the stock
 * colour filter, and the legend above the table. Negative ERP balances count
 * as red (out of stock), not yellow.
 */
const STOCK_BANDS: { value: StockBand; label: string; range: string; textClass: string; dotClass: string }[] = [
  {
    value: "red",
    label: "Red",
    range: "0 or less",
    textClass: "text-red-700 dark:text-red-400",
    dotClass: "bg-red-600 dark:bg-red-400",
  },
  {
    value: "yellow",
    label: "Yellow",
    range: `1 – ${LOW_STOCK_MAX}`,
    textClass: "text-amber-700 dark:text-amber-400",
    dotClass: "bg-amber-500 dark:bg-amber-400",
  },
  {
    value: "green",
    label: "Green",
    range: `${LOW_STOCK_MAX + 1} or more`,
    textClass: "text-emerald-700 dark:text-emerald-400",
    dotClass: "bg-emerald-600 dark:bg-emerald-400",
  },
];

function stockBand(value: number): StockBand {
  if (value <= 0) return "red";
  if (value <= LOW_STOCK_MAX) return "yellow";
  return "green";
}

function stockClass(value: number): string {
  const band = stockBand(value);
  return STOCK_BANDS.find((b) => b.value === band)?.textClass ?? "";
}

function fmtDate(value: string | null): string {
  if (!value) return "—";
  return value;
}

/** Monday-anchored ISO week start, "YYYY-MM-DD", used as the week bucket key. */
function weekBucketKey(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function bucketKeyFor(dateStr: string, granularity: Granularity): string {
  if (granularity === "day") return dateStr;
  if (granularity === "month") return dateStr.slice(0, 7);
  if (granularity === "year") return dateStr.slice(0, 4);
  return weekBucketKey(dateStr);
}

/**
 * Re-buckets a full-history series client-side for a coarser granularity.
 * Each bucket's value is its last known balance (the last point posted within
 * it); isStockout/isPurchaseRestock are true if ANY point in the bucket had
 * that flag, so a stockout mid-month still shows even if stock recovered by
 * month-end.
 */
/** "YYYY-MM-DD" -> "YYYY-MM-DD" for the next calendar day, UTC-anchored. */
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * One point for every calendar day from the series' first date to its last,
 * inclusive — using that day's end-of-day balance if a transaction occurred,
 * or forward-filling the previous day's balance otherwise. This is what
 * makes a gap in ledger activity (e.g. nothing between 2026-07-01 and
 * 2026-08-06) render as a flat line across the gap instead of Recharts
 * drawing a single diagonal line straight through it.
 */
/** Every ERP first-stock-in marker inside a bucket (each ERP has at most one overall). */
function mergeErpInitialStock(points: StockTrendSeriesPoint[]): Record<string, number> | undefined {
  const merged = Object.assign({}, ...points.map((p) => p.erpInitialStock ?? {})) as Record<string, number>;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildDailySeries(series: StockTrendSeriesPoint[]): StockTrendSeriesPoint[] {
  if (series.length === 0) return series;

  const byDay = new Map<string, StockTrendSeriesPoint[]>();
  for (const point of series) {
    const list = byDay.get(point.date);
    if (list) list.push(point);
    else byDay.set(point.date, [point]);
  }

  const result: StockTrendSeriesPoint[] = [];
  let lastBalance = series[0].totalBalance;
  let lastVoucherType = series[0].voucherType;
  let lastWarehouseBalances = series[0].warehouseBalances;
  let lastErpBalances = series[0].erpBalances;

  for (let day = series[0].date; ; day = nextDay(day)) {
    const dayPoints = byDay.get(day);
    if (dayPoints) {
      const last = dayPoints[dayPoints.length - 1];
      lastBalance = last.totalBalance;
      lastVoucherType = last.voucherType;
      lastWarehouseBalances = last.warehouseBalances;
      lastErpBalances = last.erpBalances;
      result.push({
        date: day,
        totalBalance: lastBalance,
        voucherType: lastVoucherType,
        isPurchaseRestock: dayPoints.some((p) => p.isPurchaseRestock),
        // Pinned to the SAME point as warehouseBalances below — OR-ing isStockout
        // across the whole day while showing the day's last snapshot could flag a
        // dot "stocked out" from an earlier same-day dip that had already
        // recovered by the snapshot shown, leaving the detail table empty/stale.
        isStockout: last.isStockout,
        isPartialStockout: last.isPartialStockout,
        warehouseBalances: lastWarehouseBalances,
        // Bucketing keeps the day's LAST balance, so carry the first stock-in
        // level separately or a same-day sale would hide it.
        initialStock: dayPoints.find((p) => p.initialStock !== undefined)?.initialStock,
        erpBalances: lastErpBalances,
        erpInitialStock: mergeErpInitialStock(dayPoints),
      });
    } else {
      result.push({
        date: day,
        totalBalance: lastBalance,
        voucherType: lastVoucherType,
        isPurchaseRestock: false,
        isStockout: false,
        isPartialStockout: false,
        warehouseBalances: lastWarehouseBalances,
        erpBalances: lastErpBalances,
      });
    }

    if (day === series[series.length - 1].date) break;
  }

  return result;
}

function bucketSeries(series: StockTrendSeriesPoint[], granularity: Granularity): StockTrendSeriesPoint[] {
  if (granularity === "day") return buildDailySeries(series);

  const buckets = new Map<string, StockTrendSeriesPoint[]>();
  for (const point of series) {
    const key = bucketKeyFor(point.date, granularity);
    const list = buckets.get(key);
    if (list) list.push(point);
    else buckets.set(key, [point]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, points]) => {
      const last = points[points.length - 1];
      return {
        date: last.date,
        totalBalance: last.totalBalance,
        voucherType: last.voucherType,
        isPurchaseRestock: points.some((p) => p.isPurchaseRestock),
        // Same reasoning as buildDailySeries: keep the flags pinned to `last` so
        // they always match the warehouseBalances snapshot shown for this bucket.
        isStockout: last.isStockout,
        isPartialStockout: last.isPartialStockout,
        warehouseBalances: last.warehouseBalances,
        initialStock: points.find((p) => p.initialStock !== undefined)?.initialStock,
        erpBalances: last.erpBalances,
        erpInitialStock: mergeErpInitialStock(points),
      };
    });
}

/**
 * Merges several already-bucketed variant series onto one shared date axis
 * (the union of every variant's dates), forward-filling each variant's own
 * last known balance at or before a given shared date — never extrapolating
 * before a variant's own first date or after its last, so a variant with a
 * shorter history just doesn't draw outside its own range. "total" sums
 * whichever variants have a value on that date.
 */
function buildMergedVariantSeries(perVariant: { sku: string; series: StockTrendSeriesPoint[] }[]): MergedRow[] {
  const allDates = Array.from(new Set(perVariant.flatMap((v) => v.series.map((p) => p.date)))).sort();

  return allDates.map((date) => {
    const row: Record<string, number | undefined> = {};
    let total = 0;
    for (const variant of perVariant) {
      let value: number | undefined;
      for (const point of variant.series) {
        if (point.date > date) break;
        value = point.totalBalance;
      }
      row[variant.sku] = value;
      if (value !== undefined) total += value;
    }
    return { ts: new Date(`${date}T00:00:00Z`).getTime(), date, total, ...row };
  });
}

type SkuTitleFiltersProps = {
  idPrefix: string;
  skuValue: string;
  titleValue: string;
  onSkuChange: (value: string) => void;
  onTitleChange: (value: string) => void;
  skuOptions: string[];
  titleOptions: string[];
  rows: StockTrendItemRow[];
};

/** SKU + Product title typeable comboboxes, kept in sync with each other as you type. Shared by Table and Trend view filters. */
function SkuTitleFilters({
  idPrefix,
  skuValue,
  titleValue,
  onSkuChange,
  onTitleChange,
  skuOptions,
  titleOptions,
  rows,
}: SkuTitleFiltersProps) {
  function handleSkuChange(value: string) {
    onSkuChange(value);
    const match = rows.find((r) => r.sku === value);
    if (match?.productTitle) onTitleChange(match.productTitle);
  }
  function handleTitleChange(value: string) {
    onTitleChange(value);
    const match = rows.find((r) => r.productTitle === value);
    if (match) onSkuChange(match.sku);
  }

  const skuListId = `${idPrefix}-sku-options`;
  const titleListId = `${idPrefix}-title-options`;

  return (
    <>
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-xs text-muted-foreground">SKU</label>
        <Input
          type="text"
          list={skuListId}
          placeholder="Type or select a SKU"
          value={skuValue}
          onChange={(e) => handleSkuChange(e.target.value)}
          className="h-9"
        />
        <datalist id={skuListId}>
          {skuOptions.map((sku) => (
            <option key={sku} value={sku} />
          ))}
        </datalist>
      </div>
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-xs text-muted-foreground">Product title</label>
        <Input
          type="text"
          list={titleListId}
          placeholder="Type or select a title"
          value={titleValue}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="h-9"
        />
        <datalist id={titleListId}>
          {titleOptions.map((title) => (
            <option key={title} value={title} />
          ))}
        </datalist>
      </div>
    </>
  );
}

export function StockTrendsPanel() {
  const [priorityStatus, setPriorityStatus] = useState("Low");
  const [brand, setBrand] = useState("all");
  const [createdDateFrom, setCreatedDateFrom] = useState(defaultCreatedDateFrom);
  const [createdDateTo, setCreatedDateTo] = useState(defaultCreatedDateTo);

  const [brands, setBrands] = useState<string[]>([]);

  const [skuSearchInput, setSkuSearchInput] = useState("");
  const [titleSearchInput, setTitleSearchInput] = useState("");
  const skuSearch = useDebouncedValue(skuSearchInput, SEARCH_DEBOUNCE_MS);
  const titleSearch = useDebouncedValue(titleSearchInput, SEARCH_DEBOUNCE_MS);

  // Client-side pagination only — the server no longer paginates (see route).
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  // Channel is a server-side filter (it changes what's fetched from ERP), unlike
  // priority which is filtered client-side against the already-loaded rows.
  const [channel, setChannel] = useState<StockChannel>("all");

  const [rows, setRows] = useState<StockTrendItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  // Last table load failure (ERP timeouts etc.) — shown inline with a Refresh Data button.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Client-side, like priority: narrows the loaded rows by current stock colour.
  const [stockBandFilter, setStockBandFilter] = useState<"all" | StockBand>("all");
  // Server-side post-filter (see the route); its counts are taken before the filter applies.
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const [movementCounts, setMovementCounts] = useState<Record<MovementStatus, number> | null>(null);
  // Optional client-side column sort; null keeps the server's created-date order.
  const [tableSort, setTableSort] = useState<{ key: TableSortKey; order: "asc" | "desc" } | null>(null);

  const [view, setView] = useState<"table" | "trend">("table");

  const [trendSku, setTrendSku] = useState("");
  const [trendTitle, setTrendTitle] = useState("");
  const [trendTouched, setTrendTouched] = useState(false);
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [series, setSeries] = useState<StockTrendSeriesPoint[]>([]);
  // Single-SKU live current stock from the Stock Balance report (not the last series point).
  const [seriesCurrentStock, setSeriesCurrentStock] = useState<number | null>(null);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [seriesError, setSeriesError] = useState<string | null>(null);
  // Single-SKU catalog/created-date info, used to warn when the top filters hide this SKU.
  const [seriesInfo, setSeriesInfo] = useState<StockTrendItemInfo | null>(null);
  // The stockout/partial-stockout point the user clicked on the chart, if any —
  // drives the per-warehouse detail table below it. Cleared whenever the SKU changes.
  const [selectedStockoutPoint, setSelectedStockoutPoint] = useState<StockTrendSeriesPoint | null>(null);

  // Base-SKU mode: when the typed SKU is a base with 2+ variants (see loadSeries),
  // all variants load together instead of the single-SKU series.
  const [trendMode, setTrendMode] = useState<"sku" | "base">("sku");
  const [baseVariants, setBaseVariants] = useState<VariantSeriesData[]>([]);
  // Which variant SKUs are actually plotted — capped at MAX_PLOTTED_VARIANTS,
  // user-adjustable via the picker when a base has more than that.
  const [selectedVariantSkus, setSelectedVariantSkus] = useState<string[]>([]);

  const gen = useRef(0);
  const seriesGen = useRef(0);

  // Filter setters that also reset back to page 1, so a filter change never leaves
  // the view on a now-invalid page (folded into the setter, not a separate effect).
  // priorityStatus is NOT one of these — it's filtered client-side against the
  // already-loaded page, not sent to the server, so changing it doesn't touch paging.
  function updateBrand(value: string) {
    setBrand(value);
    setPage(1);
  }
  function updateCreatedDateFrom(value: string) {
    setCreatedDateFrom(value);
    setPage(1);
  }
  function updateCreatedDateTo(value: string) {
    setCreatedDateTo(value);
    setPage(1);
  }
  function updatePageSize(value: number) {
    setPageSize(value);
    setPage(1);
  }
  function updateSortOrder(value: "asc" | "desc") {
    setSortOrder(value);
    setPage(1);
  }
  function updateChannel(value: StockChannel) {
    setChannel(value);
    setPage(1);
  }
  function updatePriorityStatus(value: string) {
    setPriorityStatus(value);
    setPage(1);
  }
  function updateStockBandFilter(value: "all" | StockBand) {
    setStockBandFilter(value);
    setPage(1);
  }
  function updateMovementFilter(value: MovementFilter) {
    setMovementFilter(value);
    setPage(1);
  }
  function updateTableSort(key: string, order: "asc" | "desc") {
    setTableSort({ key: key as TableSortKey, order });
    setPage(1);
  }
  // Row "Trend" button: chart this exact SKU in Trend view.
  function openTrendForRow(row: StockTrendItemRow) {
    setTrendTouched(true);
    setTrendSku(row.sku);
    setTrendTitle(row.productTitle ?? "");
    setView("trend");
  }
  function updateTrendSku(value: string) {
    setTrendTouched(true);
    setTrendSku(value);
  }
  function updateTrendTitle(value: string) {
    setTrendTouched(true);
    setTrendTitle(value);
  }

  useEffect(() => {
    void fetch("/api/admin/purchasing/item-trends/filter-options")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.brands)) setBrands(data.brands);
      })
      .catch(() => undefined);
  }, []);

  // skuSearch/titleSearch changing (debounced) should also land back on page 1.
  const resetPageForSearch = useCallback(() => {
    setPage(1);
  }, []);
  useEffect(() => {
    resetPageForSearch();
  }, [skuSearch, titleSearch, resetPageForSearch]);

  // `refresh` skips the server's 5-minute result cache so the Refresh Data buttons
  // always pull fresh ERP data instead of replaying the last result.
  const loadStockTrends = useCallback(async (opts?: { refresh?: boolean }) => {
    const myGen = ++gen.current;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        brand,
        createdDateFrom,
        createdDateTo,
        sortOrder,
        channel,
      });
      if (skuSearch.trim()) params.set("skuSearch", skuSearch.trim());
      if (titleSearch.trim()) params.set("titleSearch", titleSearch.trim());
      if (movementFilter !== "all") params.set("movement", movementFilter);
      if (opts?.refresh) params.set("refresh", "1");

      const res = await fetch(`/api/admin/purchasing/item-trends/stock-trends?${params}`);
      const data = await res.json().catch(() => ({}));
      if (myGen !== gen.current) return;
      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Failed to load stock trends";
        notify.error(`${message} — click Refresh Data to try again.`);
        setLoadError(message);
        setRows([]);
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setMovementCounts(data.movementCounts && typeof data.movementCounts === "object" ? data.movementCounts : null);
    } catch {
      if (myGen !== gen.current) return;
      notify.error("Failed to load stock trends — click Refresh Data to try again.");
      setLoadError("Failed to load stock trends");
      setRows([]);
    } finally {
      if (myGen === gen.current) setLoading(false);
    }
  }, [brand, createdDateFrom, createdDateTo, sortOrder, channel, skuSearch, titleSearch, movementFilter]);

  useEffect(() => {
    void loadStockTrends();
  }, [loadStockTrends]);

  // Suggestions for the SKU/title comboboxes — scoped to the current page of results,
  // since there's no separate autocomplete endpoint to draw a global list from.
  const skuOptions = useMemo(() => Array.from(new Set(rows.map((r) => r.sku))), [rows]);
  const titleOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.productTitle).filter((t): t is string => Boolean(t)))),
    [rows],
  );

  // Priority options are derived from whatever the server actually returned — the live
  // ERPNext priority values have changed before, so a hardcoded list would just go stale
  // again. "Low" stays the default filter even if it's not present in the current page.
  const priorityOptions = useMemo(() => {
    const present = Array.from(new Set(rows.map((r) => r.priorityStatus).filter((p): p is string => Boolean(p))));
    present.sort((a, b) => a.localeCompare(b));
    return ["all", ...present];
  }, [rows]);

  // Priority filtering happens here, client-side, against the full loaded set —
  // the server no longer filters by priority (see getStockTrendItems).
  const priorityRows = useMemo(() => {
    if (priorityStatus === "all") return rows;
    return rows.filter((r) => r.priorityStatus === priorityStatus);
  }, [rows, priorityStatus]);

  // Per-colour counts for the stock colour filter buttons (after priority, before colour).
  const stockBandCounts = useMemo(() => {
    const counts: Record<StockBand, number> = { red: 0, yellow: 0, green: 0 };
    for (const r of priorityRows) counts[stockBand(r.currentStock)] += 1;
    return counts;
  }, [priorityRows]);

  const visibleRows = useMemo(() => {
    if (stockBandFilter === "all") return priorityRows;
    return priorityRows.filter((r) => stockBand(r.currentStock) === stockBandFilter);
  }, [priorityRows, stockBandFilter]);

  // Age / Sell-through header sort. Rows with no value always sort last.
  const sortedRows = useMemo(() => {
    if (!tableSort) return visibleRows;
    const dir = tableSort.order === "asc" ? 1 : -1;
    return [...visibleRows].sort((a, b) => {
      const av = a[tableSort.key];
      const bv = b[tableSort.key];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return dir * (av - bv);
    });
  }, [visibleRows, tableSort]);

  // Pagination is client-side over the priority-filtered set (the server returns
  // everything matching brand/date/search, unpaginated — see the route).
  const pagedRows = useMemo(
    () => sortedRows.slice((page - 1) * pageSize, page * pageSize),
    [sortedRows, page, pageSize],
  );

  const hasActiveSearch = skuSearch.trim() !== "" || titleSearch.trim() !== "";
  const hiddenBySearchCount = rows.length - priorityRows.length;
  const showHiddenBySearchHint = hasActiveSearch && priorityRows.length === 0 && rows.length > 0;
  const hiddenByStockBandCount = priorityRows.length - visibleRows.length;
  const showHiddenByStockBandHint = stockBandFilter !== "all" && visibleRows.length === 0 && priorityRows.length > 0;

  // Trend view defaults to the table's first VISIBLE (priority-filtered) row until the user
  // picks their own SKU.
  const syncDefaultTrendSelection = useCallback(() => {
    const first = visibleRows.find((r) => !TREND_DEFAULT_EXCLUDED_SKUS.has(r.sku));
    if (!first) {
      setTrendSku("");
      setTrendTitle("");
      return;
    }
    setTrendSku(first.sku);
    setTrendTitle(first.productTitle ?? "");
  }, [visibleRows]);
  useEffect(() => {
    if (trendTouched) return;
    syncDefaultTrendSelection();
  }, [trendTouched, syncDefaultTrendSelection]);

  // Base-SKU detection: an exact SKU match always wins (even if it has siblings);
  // otherwise, if the typed value is the base stem of 2+ loaded SKUs, treat it as
  // a base SKU and load every variant together instead of a single series.
  const baseVariantSkusForInput = useMemo(() => {
    const input = trendSku.trim();
    if (!input) return [];
    if (rows.some((r) => r.sku === input)) return [];
    return Array.from(new Set(rows.filter((r) => parentSkuStem(r.sku) === input).map((r) => r.sku)));
  }, [trendSku, rows]);
  const detectedTrendMode: "sku" | "base" = baseVariantSkusForInput.length >= 2 ? "base" : "sku";

  const loadSeries = useCallback(async () => {
    setSelectedStockoutPoint(null);
    const sku = trendSku.trim();
    if (!sku) {
      setSeries([]);
      setBaseVariants([]);
      setSeriesError(null);
      setSeriesInfo(null);
      return;
    }
    const mode = detectedTrendMode;
    const myGen = ++seriesGen.current;
    setSeriesLoading(true);
    setSeriesCurrentStock(null);
    setSeriesError(null);
    setSeriesInfo(null);
    try {
      const params = new URLSearchParams({ sku, mode });
      const res = await fetch(`/api/admin/purchasing/item-trends/stock-trends-series?${params}`);
      const data = await res.json().catch(() => ({}));
      if (myGen !== seriesGen.current) return;
      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Failed to load stock trend series";
        notify.error(`${message} — click Refresh Data to try again.`);
        setSeriesError(message);
        setSeries([]);
        setBaseVariants([]);
        return;
      }
      // The server may upgrade a "sku" lookup to variant mode (base SKU not in the loaded rows).
      const resolvedMode: "sku" | "base" = Array.isArray(data.variants) ? "base" : mode;
      setTrendMode(resolvedMode);
      if (resolvedMode === "base") {
        const variants: VariantSeriesData[] = Array.isArray(data.variants) ? data.variants : [];
        setBaseVariants(variants);
        setSeries([]);
        // Default selection: the top MAX_PLOTTED_VARIANTS by current stock, so a
        // 60-variant family doesn't try to plot everything at once.
        setSelectedVariantSkus(
          [...variants]
            .sort((a, b) => b.currentStock - a.currentStock)
            .slice(0, MAX_PLOTTED_VARIANTS)
            .map((v) => v.sku),
        );
      } else {
        setSeries(Array.isArray(data.series) ? data.series : []);
        setSeriesCurrentStock(typeof data.currentStock === "number" ? data.currentStock : null);
        setSeriesInfo(data.info && typeof data.info === "object" ? data.info : null);
        setBaseVariants([]);
      }
    } catch {
      if (myGen !== seriesGen.current) return;
      notify.error("Failed to load stock trend series — click Refresh Data to try again.");
      setSeriesError("Failed to load stock trend series");
      setSeries([]);
      setBaseVariants([]);
    } finally {
      if (myGen === seriesGen.current) setSeriesLoading(false);
    }
  }, [trendSku, detectedTrendMode]);

  // Why the searched SKU (or base SKU's variants) isn't in the table: compares the
  // item's own priority / brand / created date against each top filter separately,
  // so the user gets one fixable warning per filter instead of a bare "not found".
  const trendFilterIssues = useMemo<TrendFilterIssue[]>(() => {
    if (seriesLoading || seriesError) return [];
    const sku = trendSku.trim();
    const infos: (StockTrendItemInfo & { sku: string })[] =
      trendMode === "base" ? baseVariants : seriesInfo ? [{ ...seriesInfo, sku }] : [];
    if (infos.length === 0) return [];
    // Already visible in the table → nothing to warn about.
    if (infos.some((i) => visibleRows.some((r) => r.sku === i.sku))) return [];

    const isBase = trendMode === "base";
    const subject = isBase ? "None of this base SKU's variants" : "This item";

    if (!isBase && !infos[0].inCatalog) {
      return [
        {
          key: "catalog",
          message: `"${sku}" isn't in the item catalog — check the SKU spelling, or the item may be archived or not synced yet.`,
          fixLabel: null,
          onFix: null,
        },
      ];
    }

    const issues: TrendFilterIssue[] = [];

    if (priorityStatus !== "all" && !infos.some((i) => i.priorityStatus === priorityStatus)) {
      const priorities = Array.from(new Set(infos.map((i) => i.priorityStatus ?? "no priority")));
      const single = priorities.length === 1 && priorities[0] !== "no priority" ? priorities[0] : null;
      issues.push({
        key: "priority",
        message: isBase
          ? `${subject} are "${priorityStatus}" priority (they're ${priorities.join(", ")}).`
          : `This item's priority is "${priorities[0]}", but the Priority status filter is "${priorityStatus}".`,
        fixLabel: single ? `Switch priority to ${single}` : "Show all priorities",
        onFix: () => updatePriorityStatus(single ?? "all"),
      });
    }

    if (brand !== "all" && !infos.some((i) => (i.brand ?? "").trim().toLowerCase() === brand.trim().toLowerCase())) {
      const itemBrand = infos.find((i) => i.brand)?.brand ?? null;
      issues.push({
        key: "brand",
        message: `${isBase ? "These variants are" : "This item is"} ${itemBrand ? `brand "${itemBrand}"` : "not linked to a brand"}, but the Brand filter is "${brand}".`,
        fixLabel: "Show all brands",
        onFix: () => updateBrand("all"),
      });
    }

    const dates = infos.map((i) => i.createdDate).filter((d): d is string => Boolean(d)).sort();
    if (dates.length === 0) {
      issues.push({
        key: "date",
        message: `${isBase ? "These variants have" : "This item has"} no purchase stock-in yet, so there's no created date — it won't show in the table for any date range.`,
        fixLabel: null,
        onFix: null,
      });
    } else if (!dates.some((d) => d >= createdDateFrom && d <= createdDateTo)) {
      const first = dates[0];
      const last = dates[dates.length - 1];
      issues.push({
        key: "date",
        message: `${isBase ? `Variants were created ${first === last ? `on ${first}` : `between ${first} and ${last}`}` : `This item was created on ${first}`}, outside the Created from/to range (${createdDateFrom} to ${createdDateTo}).`,
        fixLabel: "Include it in the date range",
        onFix: () => {
          if (first < createdDateFrom) updateCreatedDateFrom(first);
          if (last > createdDateTo) updateCreatedDateTo(last);
        },
      });
    }

    return issues;
  }, [
    seriesLoading,
    seriesError,
    trendSku,
    trendMode,
    baseVariants,
    seriesInfo,
    visibleRows,
    priorityStatus,
    brand,
    createdDateFrom,
    createdDateTo,
  ]);

  useEffect(() => {
    if (view !== "trend") return;
    void loadSeries();
  }, [view, loadSeries]);

  const bucketedSeries = useMemo(() => bucketSeries(series, granularity), [series, granularity]);
  // Stats always count at day resolution (end-of-day state), regardless of the
  // selected display granularity — otherwise a momentary intraday dip that
  // recovers before day's end (ordinary warehouse-transfer noise) would inflate
  // "Times stocked out" even though the chart itself never shows a dot for it.
  const dailySeries = useMemo(() => buildDailySeries(series), [series]);
  const stockoutCount = useMemo(() => dailySeries.filter((p) => p.isStockout).length, [dailySeries]);

  // Only the picked-and-capped variants get bucketed/merged — an unpicked 60-variant
  // family shouldn't pay to bucket lines nobody's plotting.
  const plottedVariants = useMemo(
    () => baseVariants.filter((v) => selectedVariantSkus.includes(v.sku)),
    [baseVariants, selectedVariantSkus],
  );
  // Each variant is bucketed independently (its own gaps/history length, per the
  // spec) before merging onto one shared date axis for the chart.
  const bucketedVariants = useMemo(
    () => plottedVariants.map((v) => ({ ...v, series: bucketSeries(v.series, granularity) })),
    [plottedVariants, granularity],
  );
  const mergedVariantData = useMemo(() => buildMergedVariantSeries(bucketedVariants), [bucketedVariants]);
  const variantLines = useMemo<VariantSeriesLine[]>(
    () =>
      bucketedVariants.map((v, i) => ({
        sku: v.sku,
        label: v.sku,
        color: VARIANT_COLORS[i % VARIANT_COLORS.length],
      })),
    [bucketedVariants],
  );
  // Per-variant summary row (plus a Total row) for base-SKU mode — a single set of
  // numbers wouldn't mean much once several variants' stock is being compared.
  const variantStats = useMemo(
    () =>
      baseVariants.map((v) => {
        // Day-level (end-of-day) state, same as the single-SKU view — otherwise a
        // momentary intraday dip that recovers before day's end would inflate this
        // count even though the chart never shows a dot for it.
        const daily = buildDailySeries(v.series);
        return {
          sku: v.sku,
          productTitle: v.productTitle,
          currentStock: v.currentStock,
          stockouts: daily.filter((p) => p.isStockout).length,
        };
      }),
    [baseVariants],
  );
  const variantStatsTotal = useMemo(
    () => ({
      currentStock: variantStats.reduce((s, v) => s + v.currentStock, 0),
      stockouts: variantStats.reduce((s, v) => s + v.stockouts, 0),
    }),
    [variantStats],
  );

  function resetMainFilters() {
    setPriorityStatus("Low");
    setBrand("all");
    setCreatedDateFrom(defaultCreatedDateFrom());
    setCreatedDateTo(defaultCreatedDateTo());
    setSortOrder("asc");
    setChannel("all");
  }

  function resetTableFilters() {
    setSkuSearchInput("");
    setTitleSearchInput("");
    setPageSize(20);
    setStockBandFilter("all");
    setMovementFilter("all");
  }

  // Refresh Data reloads whichever screen is open (table rows always, since they
  // also feed the Trend view's SKU suggestions) — skipping the server cache.
  const anyLoadError = loadError ?? (view === "trend" ? seriesError : null);
  const refreshing = loading || (view === "trend" && seriesLoading);
  function handleRefreshData() {
    void loadStockTrends({ refresh: true });
    if (view === "trend") void loadSeries();
  }

  // Exports every row currently matching the filters above (priority, brand,
  // date range, search) — not just the current page — plus those filter
  // values themselves so the file is self-describing once downloaded.
  function handleExportStockTrends() {
    const csv = buildStockTrendsCsv(sortedRows, {
      movement: movementFilter,
      priorityStatus,
      brand,
      createdDateFrom,
      createdDateTo,
    });
    downloadCsv(`stock-trends-${createdDateFrom}-to-${createdDateTo}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Priority status</label>
            <select
              className="flex h-9 min-w-[150px] rounded-md border border-input bg-background px-3 text-sm"
              value={priorityStatus}
              onChange={(e) => updatePriorityStatus(e.target.value)}
            >
              {(priorityOptions.includes(priorityStatus) ? priorityOptions : [priorityStatus, ...priorityOptions]).map(
                (opt) => (
                  <option key={opt} value={opt}>
                    {opt === "all" ? "All priorities" : opt}
                  </option>
                ),
              )}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Brand</label>
            <select
              className="flex h-9 min-w-[150px] rounded-md border border-input bg-background px-3 text-sm"
              value={brand}
              onChange={(e) => updateBrand(e.target.value)}
            >
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Created from</label>
            <Input
              type="date"
              value={createdDateFrom}
              onChange={(e) => updateCreatedDateFrom(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Created to</label>
            <Input
              type="date"
              value={createdDateTo}
              onChange={(e) => updateCreatedDateTo(e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Sort by created date</label>
            <select
              className="flex h-9 min-w-[150px] rounded-md border border-input bg-background px-3 text-sm"
              value={sortOrder}
              onChange={(e) => updateSortOrder(e.target.value as "asc" | "desc")}
            >
              <option value="asc">Oldest first</option>
              <option value="desc">Newest first</option>
            </select>
          </div>
          <Button type="button" variant="ghost" onClick={resetMainFilters}>
            Reset to default
          </Button>
          <span className="ml-auto self-center text-xs text-muted-foreground">
            Default: Low priority items created in the last {STOCK_TRENDS_DEFAULT_RANGE_MONTHS} months
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : `${visibleRows.length} item${visibleRows.length === 1 ? "" : "s"} loaded`}
        </p>
        <div>
          <Button
            type="button"
            variant={anyLoadError ? "default" : "outline"}
            size="sm"
            onClick={handleRefreshData}
            disabled={refreshing}
          >
            <RotateCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
            Refresh Data
          </Button>
        </div>
      </div>

      {anyLoadError && !refreshing ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          <span>
            The data couldn&apos;t be loaded ({anyLoadError}). Click <strong>Refresh Data</strong> to try again —
            no need to reload the page.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={handleRefreshData}>
            <RotateCw className="size-4" aria-hidden />
            Refresh Data
          </Button>
        </div>
      ) : null}

      {showHiddenBySearchHint ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <span>
            {hiddenBySearchCount} match{hiddenBySearchCount === 1 ? "" : "es"} hidden by the &quot;{priorityStatus}
            &quot; filter.
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => updatePriorityStatus("all")}>
            Show all priorities
          </Button>
        </div>
      ) : null}

      <div className="inline-flex overflow-hidden rounded-md border border-input">
        {(
          [
            { value: "table", label: "Table view" },
            { value: "trend", label: "Trend view" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setView(opt.value)}
            className={cn(
              "border-l border-input px-4 py-1.5 text-sm font-medium first:border-l-0",
              view === opt.value
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {view === "table" ? (
        <>
          <Card>
            {/*
              Two fixed rows: search boxes, then the toggle filters. In one shared
              wrapping row the toggles' changing count widths made Movement hop
              between lines and the search boxes resize.
            */}
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <SkuTitleFilters
                  idPrefix="stock-trends-table"
                  skuValue={skuSearchInput}
                  titleValue={titleSearchInput}
                  onSkuChange={setSkuSearchInput}
                  onTitleChange={setTitleSearchInput}
                  skuOptions={skuOptions}
                  titleOptions={titleOptions}
                  rows={rows}
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Channel</label>
                <div className="inline-flex overflow-hidden rounded-md border border-input">
                  {(
                    [
                      { value: "online", label: "Online" },
                      { value: "shop", label: "Shop" },
                      { value: "all", label: "All" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateChannel(opt.value)}
                      className={cn(
                        "border-l border-input px-3 py-1.5 text-sm font-medium first:border-l-0",
                        channel === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Stock colour</label>
                <div className="inline-flex overflow-hidden rounded-md border border-input">
                  {(
                    [{ value: "all", label: "All", range: "", dotClass: null }, ...STOCK_BANDS] as {
                      value: "all" | StockBand;
                      label: string;
                      range: string;
                      dotClass: string | null;
                    }[]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateStockBandFilter(opt.value)}
                      title={opt.dotClass ? `Current stock ${opt.range}` : undefined}
                      aria-label={opt.dotClass ? `${opt.label} — current stock ${opt.range}` : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 border-l border-input px-3 py-1.5 text-sm font-medium first:border-l-0",
                        stockBandFilter === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {opt.dotClass ? (
                        <span className={cn("size-3 rounded-full", opt.dotClass)} aria-hidden />
                      ) : (
                        opt.label
                      )}
                      {opt.value !== "all" ? (
                        <span className="text-xs tabular-nums opacity-70">({stockBandCounts[opt.value]})</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Movement</label>
                <div className="inline-flex overflow-hidden rounded-md border border-input">
                  {MOVEMENT_FILTER_OPTIONS.map((opt) => {
                    const count =
                      movementCounts === null
                        ? null
                        : opt.value === "all"
                          ? Object.values(movementCounts).reduce((sum, n) => sum + n, 0)
                          : movementCounts[opt.value];
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateMovementFilter(opt.value)}
                        className={cn(
                          "inline-flex items-center gap-1.5 border-l border-input px-3 py-1.5 text-sm font-medium first:border-l-0",
                          movementFilter === opt.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        {opt.label}
                        {count !== null ? <span className="text-xs tabular-nums opacity-70">({count})</span> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="ml-auto flex items-end gap-3">
                <Button type="button" variant="ghost" onClick={resetTableFilters}>
                  Clear filters
                </Button>
                <Button type="button" variant="outline" onClick={handleExportStockTrends} disabled={visibleRows.length === 0}>
                  Export
                </Button>
              </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <p>Units purchased and units sold are all-time totals.</p>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Current stock colours:</span>
              {STOCK_BANDS.map((b) => (
                <span key={b.value} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-3 rounded-full", b.dotClass)} aria-label={b.label} role="img" />
                  <span>= {b.range}</span>
                </span>
              ))}
            </p>
          </div>

          {showHiddenByStockBandHint ? (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <span>
                {hiddenByStockBandCount} item{hiddenByStockBandCount === 1 ? "" : "s"} hidden by the &quot;
                {STOCK_BANDS.find((b) => b.value === stockBandFilter)?.label}&quot; stock colour filter.
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => updateStockBandFilter("all")}>
                Show all stock colours
              </Button>
            </div>
          ) : null}

          <Card>
            <CardContent className="p-0">
              {/* No horizontal scroll box here — it would capture position:sticky and stop the header sticking under the topbar. */}
              <TooltipProvider>
              <Table containerClassName="overflow-visible">
                <TableHeader className={STICKY_TABLE_HEADER_CLASS}>
                  <TableRow>
                    {/* Everything except Item is centred. */}
                    <TableHead className="w-[20rem] max-w-[20rem]">SKU / Product title</TableHead>
                    <TableHead className={WRAPPED_HEAD_CLASS}>Trend View</TableHead>
                    <TableHead className={WRAPPED_HEAD_CLASS}>Created date</TableHead>
                    <TableHead className={WRAPPED_HEAD_CLASS}>Current stock</TableHead>
                    <TableHead className={WRAPPED_HEAD_CLASS}>Latest stockout date</TableHead>
                    <TableHead className={WRAPPED_HEAD_CLASS}>Units purchased</TableHead>
                    <TableHead className={WRAPPED_HEAD_CLASS}>Units sold</TableHead>
                    <SortableColumnHeader
                      label="Age (days)"
                      sortKey="ageDays"
                      currentSort={tableSort?.key}
                      currentOrder={tableSort?.order}
                      onSort={updateTableSort}
                      align="center"
                      className={WRAPPED_SORTABLE_HEAD_CLASS}
                    />
                    <SortableColumnHeader
                      label="Sell-through"
                      sortKey="sellThroughPct"
                      currentSort={tableSort?.key}
                      currentOrder={tableSort?.order}
                      onSort={updateTableSort}
                      align="center"
                      className={WRAPPED_SORTABLE_HEAD_CLASS}
                    />
                    <TableHead className={WRAPPED_HEAD_CLASS}>Movement</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" aria-hidden />
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : loadError ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center">
                        <p className="mb-3 text-sm text-destructive">{loadError}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void loadStockTrends({ refresh: true })}
                        >
                          <RotateCw className="size-4" aria-hidden />
                          Refresh Data
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : pagedRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                        No rows to show
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagedRows.map((row) => (
                      <TableRow key={row.sku}>
                        {/* Item = SKU (primary) + priority label, with the product title on its own line below. */}
                        <TableCell className="w-[20rem] max-w-[20rem] whitespace-normal">
                          <div className="font-mono font-bold">
                            {/* Own span so a double-click (or single click) selects just the SKU for copying. */}
                            <span className="select-all">{row.sku}</span>
                            {row.priorityStatus ? (
                              <span
                                className={cn(
                                  "ml-2 inline-flex select-none items-center rounded-full px-2 py-0.5 font-sans text-xs font-semibold ring-1 ring-inset",
                                  priorityLabelClass(row.priorityStatus),
                                )}
                              >
                                {row.priorityStatus}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground">{row.productTitle ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="size-8"
                            onClick={() => openTrendForRow(row)}
                            title={`Open ${row.sku} in Trend view`}
                            aria-label={`Open ${row.sku} in Trend view`}
                          >
                            <ChartLine className="size-4" aria-hidden />
                          </Button>
                        </TableCell>
                        <TableCell className="text-center">{fmtDate(row.createdDate)}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-semibold ${stockClass(row.currentStock)}`}>{row.currentStock}</span>
                        </TableCell>
                        <TableCell className={cn("text-center", !row.latestStockoutDate && "text-muted-foreground")}>
                          {fmtDate(row.latestStockoutDate)}
                        </TableCell>
                        <TableCell className="text-center">{row.unitsPurchased}</TableCell>
                        <TableCell className="text-center">{row.unitsSold}</TableCell>
                        <TableCell className="text-center tabular-nums">{row.ageDays ?? "—"}</TableCell>
                        <TableCell className="text-center">
                          <SellThroughCell pct={row.sellThroughPct} />
                        </TableCell>
                        <TableCell className="text-center">
                          <MovementBadge status={row.movementStatus} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              </TooltipProvider>
              <div className="border-t p-3">
                <Pagination
                  page={page}
                  limit={pageSize}
                  total={visibleRows.length}
                  onPageChange={setPage}
                  onLimitChange={updatePageSize}
                  limitOptions={PAGE_SIZE_OPTIONS}
                />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p>
              Sell-through = units sold ÷ units purchased.
            </p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span>Movement:</span>
              {(Object.keys(MOVEMENT_DISPLAY) as MovementStatus[]).map((status) => (
                <span key={status} className="inline-flex items-center gap-1.5">
                  <MovementBadge status={status} />
                  {MOVEMENT_DISPLAY[status].rule}
                </span>
              ))}
            </p>
          </div>
        </>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3">
              <SkuTitleFilters
                idPrefix="stock-trends-trend"
                skuValue={trendSku}
                titleValue={trendTitle}
                onSkuChange={updateTrendSku}
                onTitleChange={updateTrendTitle}
                skuOptions={skuOptions}
                titleOptions={titleOptions}
                rows={rows}
              />
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">Granularity</label>
                <div className="inline-flex overflow-hidden rounded-md border border-input">
                  {GRANULARITY_OPTIONS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGranularity(g)}
                      className={cn(
                        "border-l border-input px-3 py-1.5 text-sm font-medium capitalize first:border-l-0",
                        granularity === g
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {trendFilterIssues.length > 0 ? (
            <div
              role="status"
              className="space-y-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            >
              <p className="font-medium">
                {trendFilterIssues[0].key === "catalog"
                  ? "Item not found"
                  : `"${trendSku.trim()}" isn't in the table because of the filters at the top:`}
              </p>
              <ul className="space-y-2">
                {trendFilterIssues.map((issue) => (
                  <li key={issue.key} className="flex flex-wrap items-center gap-2">
                    <span>• {issue.message}</span>
                    {issue.onFix && issue.fixLabel ? (
                      <Button type="button" variant="outline" size="sm" onClick={issue.onFix}>
                        {issue.fixLabel}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <Card>
            <CardContent>
              {!trendSku.trim() ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No item to chart yet — load some rows in Table view, or type a SKU above.
                </p>
              ) : seriesLoading ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading…
                </div>
              ) : seriesError ? (
                <div className="py-10 text-center">
                  <p className="mb-3 text-sm text-destructive">{seriesError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void loadSeries()}>
                    <RotateCw className="size-4" aria-hidden />
                    Refresh Data
                  </Button>
                </div>
              ) : trendMode === "base" ? (
                <>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold">Base SKU: {trendSku}</h3>
                    <p className="text-xs text-muted-foreground">
                      {baseVariants.length} variant{baseVariants.length === 1 ? "" : "s"}
                      {baseVariants.length > MAX_PLOTTED_VARIANTS
                        ? ` — plotting ${selectedVariantSkus.length} of ${baseVariants.length} (pick below)`
                        : null}
                    </p>
                  </div>

                  {baseVariants.length > MAX_PLOTTED_VARIANTS ? (
                    <div className="mb-4 flex flex-wrap gap-2 rounded-md border p-3">
                      {baseVariants.map((v) => {
                        const checked = selectedVariantSkus.includes(v.sku);
                        return (
                          <label
                            key={v.sku}
                            className={cn(
                              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                              checked ? "border-primary bg-primary/10" : "border-input text-muted-foreground",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-3"
                              checked={checked}
                              disabled={!checked && selectedVariantSkus.length >= MAX_PLOTTED_VARIANTS}
                              onChange={(e) =>
                                setSelectedVariantSkus((prev) =>
                                  e.target.checked ? [...prev, v.sku] : prev.filter((s) => s !== v.sku),
                                )
                              }
                            />
                            {v.sku}
                          </label>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="mb-4">
                    <Table containerClassName="overflow-visible">
                      <TableHeader className={STICKY_TABLE_HEADER_CLASS}>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Product title</TableHead>
                          <TableHead className="text-right">Current stock</TableHead>
                          <TableHead className="text-right">Times stocked out</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variantStats.map((v) => (
                          <TableRow key={v.sku}>
                            <TableCell className="font-mono text-muted-foreground">{v.sku}</TableCell>
                            <TableCell>{v.productTitle ?? "—"}</TableCell>
                            <TableCell className="text-right">
                              <span className={`font-semibold ${stockClass(v.currentStock)}`}>{v.currentStock}</span>
                            </TableCell>
                            <TableCell className="text-right">{v.stockouts}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-semibold">
                          <TableCell colSpan={2}>Total</TableCell>
                          <TableCell className="text-right">{variantStatsTotal.currentStock}</TableCell>
                          <TableCell className="text-right">{variantStatsTotal.stockouts}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <StockTrendMultiChart data={mergedVariantData} lines={variantLines} />
                </>
              ) : (
                <>
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold">{trendTitle || trendSku}</h3>
                    <p className="text-xs text-muted-foreground">{trendSku}</p>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-6">
                    <div>
                      <div className="text-lg font-semibold">
                        {seriesCurrentStock ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">Current stock</div>
                    </div>
                    <div>
                      <div className="text-lg font-semibold">{stockoutCount}</div>
                      <div className="text-xs text-muted-foreground">Times stocked out</div>
                    </div>
                  </div>
                  <StockTrendChart points={bucketedSeries} onPointClick={setSelectedStockoutPoint} />

                  {selectedStockoutPoint ? (
                    <div className="mt-4 rounded-md border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold">
                            Out-of-stock warehouses on {selectedStockoutPoint.date}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {Object.values(selectedStockoutPoint.warehouseBalances).filter((b) => b === 0).length} of{" "}
                            {Object.keys(selectedStockoutPoint.warehouseBalances).length} warehouses out of stock as
                            of this date
                          </p>
                        </div>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedStockoutPoint(null)}>
                          Close
                        </Button>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Warehouse</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(selectedStockoutPoint.warehouseBalances)
                            .filter(([, balance]) => balance === 0)
                            .map(([warehouse]) => (
                              <TableRow key={warehouse}>
                                <TableCell>{warehouse}</TableCell>
                                <TableCell className="text-right font-semibold text-red-700 dark:text-red-400">
                                  0
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
