"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, RefreshCw, UserX } from "lucide-react";

import {
  BLANK_FILTER_VALUE,
  ColumnFilter,
  type ColumnSortDir,
} from "@/components/molecules/column-filter";
import {
  formatNumber,
  HEAD_CLASS,
  TABLE_CLASS,
  TABLE_CONTAINER_CLASS,
} from "@/components/organisms/sales-budget-table-ui";
import {
  ItemDraftingDashboardCharts,
  type DashboardTarget,
} from "@/components/organisms/item-drafting-dashboard-charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  isGuestCreated,
  type ItemDraftingDashboardData,
  type ItemDraftingDashboardRow,
} from "@/lib/discontinued-items/dashboard";
import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { cn } from "@/lib/utils";

/**
 * Column widths, left to right — EDIT THESE to resize the table. The table is locked
 * (table-fixed), so each column keeps exactly this width; text that doesn't fit wraps.
 * null = no fixed width: that column takes whatever space is left.
 */
const COLUMN_WIDTHS: (string | null)[] = [
  "110px", // SKU (Variant SKU, Common SKU under it)
  null, // Item name (takes the rest)
  "100px", // Created date
  "60px", // Current stock
  "60px", // ROP
  "66px", // Max sale qty
  "110px", // Present in → ERP 1 / Website
  "110px", // Present in → ERP 2
];

const COLUMNS = COLUMN_WIDTHS.length;

/** Columns with an Excel-style filter. */
const COLUMN_KEYS = ["sku", "item", "created", "stock", "rop", "maxSale", "erp1", "erp2"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
const NUMERIC_COLUMNS = new Set<ColumnKey>(["stock", "rop", "maxSale"]);

/** The value a column filter lists / matches for a row (what the cell shows, as text). */
function columnValueOf(row: ItemDraftingDashboardRow, key: ColumnKey): string {
  const num = (value: number | null) => (value == null ? BLANK_FILTER_VALUE : String(value));
  switch (key) {
    case "sku":
      // Common SKU included, so the filter's search finds either.
      return row.commonSku && row.commonSku !== row.sku.toUpperCase()
        ? `${row.sku} (${row.commonSku})`
        : row.sku;
    case "item":
      return row.productTitle?.trim() || BLANK_FILTER_VALUE;
    case "created":
      return row.createdDate ?? BLANK_FILTER_VALUE;
    case "stock":
      return num(row.currentStock);
    case "rop":
      return num(row.rop);
    case "maxSale":
      return num(row.maxSaleQty);
    case "erp1":
      return row.inErp1 ? "Present" : "Not in ERP";
    case "erp2":
      return row.inErp2 ? "Present" : "Not in ERP";
  }
}

/** Number sort for the numeric columns (blank first when ascending). */
function numericOf(row: ItemDraftingDashboardRow, key: ColumnKey): number {
  const value = key === "stock" ? row.currentStock : key === "rop" ? row.rop : row.maxSaleQty;
  return value ?? Number.NEGATIVE_INFINITY;
}

/** A Created date whose ERP "Created By" is Guest: amber pill with a small user-x icon. */
function GuestDate({ date }: { date: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-amber-500/25 px-1.5 py-0.5 font-semibold text-amber-800 ring-1 ring-inset ring-amber-500/60 dark:text-amber-200"
      title="Created by Guest"
    >
      <UserX className="h-3 w-3 shrink-0" aria-hidden />
      {date}
    </span>
  );
}

/** Whether the SKU is on that ERP's Item list: a green ✓, or "Not in ERP" in grey. */
function ErpPresenceCell({ inErp }: { inErp: boolean }) {
  if (!inErp) {
    return <span className="text-xs text-muted-foreground">Not in ERP</span>;
  }
  return (
    <span className="inline-flex text-emerald-600 dark:text-emerald-400" title="Present">
      <Check className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">Present</span>
    </span>
  );
}

/** Read-only overview of the Discontinued Items (the Purchasing Approval list), per variant SKU. */
export function ItemDraftingDashboard({
  reloadKey = 0,
  onRefreshed,
  onOpen,
}: {
  /** Bumped when another tab changed or refreshed items, so the numbers stay in step. */
  reloadKey?: number;
  /** Refresh here finished: lets the other tabs and badges reload too. */
  onRefreshed?: () => void;
  /** A count card / doughnut segment click: open that tab, filtered. */
  onOpen?: (target: DashboardTarget) => void;
} = {}) {
  const [data, setData] = useState<ItemDraftingDashboardData | null>(null);
  // True only for this tab's own Refresh: re-read the ERP data (other reloads use the cache).
  const wantErpRefresh = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [guestOnly, setGuestOnly] = useState(false);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnKey, Set<string>>>>({});
  const [columnSort, setColumnSort] = useState<{ key: ColumnKey; dir: ColumnSortDir } | null>(null);
  // Bumped by this tab's Refresh button.
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = wantErpRefresh.current;
    wantErpRefresh.current = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/discontinued-items/dashboard${refresh ? "?refresh=1" : ""}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Failed to load the dashboard");
        if (active) {
          setData(body as ItemDraftingDashboardData);
          if (refresh) onRefreshed?.();
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load the dashboard");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // onRefreshed is a stable callback from the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, reloadKey]);

  const guestCount = useMemo(
    () => (data?.rows ?? []).filter((row) => row.createdDate && isGuestCreated(row.createdBy)).length,
    [data],
  );

  // Rows after search + the Guest chip; the column filters' value lists come from these.
  const baseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (row) =>
        (!guestOnly || (row.createdDate && isGuestCreated(row.createdBy))) &&
        (!q ||
          row.sku.toLowerCase().includes(q) ||
          row.commonSku.toLowerCase().includes(q) ||
          (row.productTitle ?? "").toLowerCase().includes(q)),
    );
  }, [data, search, guestOnly]);

  const columnValues = useMemo(() => {
    const out = {} as Record<ColumnKey, string[]>;
    for (const key of COLUMN_KEYS) out[key] = baseRows.map((row) => columnValueOf(row, key));
    return out;
  }, [baseRows]);

  const shown = useMemo(() => {
    const rows = baseRows.filter((row) =>
      COLUMN_KEYS.every((key) => {
        const allowed = columnFilters[key];
        return !allowed || allowed.has(columnValueOf(row, key));
      }),
    );
    if (!columnSort) return rows;
    const { key, dir } = columnSort;
    const factor = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) =>
      NUMERIC_COLUMNS.has(key)
        ? (numericOf(a, key) - numericOf(b, key)) * factor
        : columnValueOf(a, key).localeCompare(columnValueOf(b, key), undefined, { numeric: true }) * factor,
    );
  }, [baseRows, columnFilters, columnSort]);

  const anyColumnFilter = COLUMN_KEYS.some((key) => columnFilters[key]) || columnSort !== null;

  /** Header label + its Excel-style filter. */
  const headerWithFilter = (
    key: ColumnKey,
    label: React.ReactNode,
    filterLabel: string,
    align: "left" | "center" = "center",
  ) => (
    <div className={cn("flex flex-wrap items-center gap-1", align === "center" ? "justify-center" : "justify-start")}>
      <span>{label}</span>
      <ColumnFilter
        label={filterLabel}
        values={columnValues[key]}
        selected={columnFilters[key] ?? null}
        onChange={(next) => setColumnFilters((prev) => ({ ...prev, [key]: next ?? undefined }))}
        sortDir={columnSort && columnSort.key === key ? columnSort.dir : null}
        onSort={(dir) => setColumnSort(dir ? { key, dir } : null)}
        numeric={NUMERIC_COLUMNS.has(key)}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {data?.summary && (
        <ItemDraftingDashboardCharts summary={data.summary} onOpen={(target) => onOpen?.(target)} />
      )}
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-lg">Overview</CardTitle>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, Common SKU or name"
              className="h-9 w-64"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                wantErpRefresh.current = true;
                setRefreshKey((k) => k + 1);
              }}
              disabled={loading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Read-only. Variant SKUs with Product Priority “Discontinue” and 0 stock (the Purchasing
          Approval list).
          {data && ` ${shown.length} of ${data.rows.length} shown · ERP data read ${formatAppIsoDateTime(data.fetchedAt)}.`}
          {anyColumnFilter && (
            <button
              type="button"
              className="ml-2 font-semibold text-primary underline-offset-2 hover:underline"
              onClick={() => {
                setColumnFilters({});
                setColumnSort(null);
              }}
            >
              Clear column filters
            </button>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-slate-400/30 bg-slate-500/10 px-3 py-1.5 text-xs text-slate-700 dark:border-slate-400/25 dark:bg-slate-400/10 dark:text-slate-300">
          <span className="inline-flex items-center gap-1 font-semibold">
            <UserX className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Created by Guest:
          </span>
          <span>added by an integration or import, not by a staff member.</span>
          {data && (
            <button
              type="button"
              onClick={() => setGuestOnly((on) => !on)}
              aria-pressed={guestOnly}
              disabled={guestCount === 0 && !guestOnly}
              className={cn(
                "ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                guestOnly
                  ? "border-amber-500/70 bg-amber-500/25 text-amber-800 dark:text-amber-200"
                  : "border-slate-400/40 bg-background/60 hover:bg-slate-500/15",
              )}
            >
              {guestOnly ? "Showing Guest-created only · Clear" : `Show only Guest-created (${guestCount})`}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
          <Table containerClassName={TABLE_CONTAINER_CLASS} className={cn(TABLE_CLASS, "table-fixed")}>
            <colgroup>
              {COLUMN_WIDTHS.map((width, index) => (
                <col key={index} style={width ? { width } : undefined} />
              ))}
            </colgroup>
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead rowSpan={2} className={HEAD_CLASS}>
                  {headerWithFilter(
                    "sku",
                    <>
                      Variant SKU
                      <span className="block text-[10px] font-normal text-muted-foreground">Common SKU</span>
                    </>,
                    "SKU",
                  )}
                </TableHead>
                <TableHead rowSpan={2} className={cn(HEAD_CLASS, "text-left")}>
                  {headerWithFilter("item", "Item name", "Item name", "left")}
                </TableHead>
                <TableHead rowSpan={2} className={HEAD_CLASS}>
                  {headerWithFilter("created", "Created date", "Created date")}
                </TableHead>
                <TableHead rowSpan={2} className={HEAD_CLASS}>
                  {headerWithFilter("stock", "Current stock", "Current stock")}
                </TableHead>
                <TableHead rowSpan={2} className={HEAD_CLASS}>
                  {headerWithFilter("rop", "ROP", "ROP")}
                </TableHead>
                <TableHead rowSpan={2} className={HEAD_CLASS}>
                  {headerWithFilter("maxSale", "Max sale qty", "Max sale qty")}
                </TableHead>
                <TableHead colSpan={2} className={HEAD_CLASS}>Present in</TableHead>
              </TableRow>
              <TableRow>
                <TableHead className={HEAD_CLASS}>
                  {headerWithFilter("erp1", "ERP 1 / Website", "ERP 1 / Website")}
                </TableHead>
                <TableHead className={HEAD_CLASS}>
                  {headerWithFilter("erp2", "ERP 2", "ERP 2")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !data ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="h-32 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Reading ERP items and stock. The first load can take a few minutes.
                    </p>
                  </TableCell>
                </TableRow>
              ) : error && !data ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="h-24 text-center text-sm text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="h-24 text-center text-sm text-muted-foreground">
                    No items.
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell className="whitespace-normal break-all text-center font-mono">
                      <span className="block text-xs">{row.sku}</span>
                      {row.commonSku && row.commonSku !== row.sku.toUpperCase() && (
                        <span className="block text-[10px] text-muted-foreground">{row.commonSku}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <p className="text-sm leading-snug">{row.productTitle ?? "-"}</p>
                    </TableCell>
                    <TableCell
                      className="text-center text-xs tabular-nums"
                      title={row.createdBy ? `Created by ${row.createdBy}` : undefined}
                    >
                      {row.createdDate && isGuestCreated(row.createdBy) ? (
                        <GuestDate date={row.createdDate} />
                      ) : (
                        (row.createdDate ?? "-")
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{formatNumber(row.currentStock)}</TableCell>
                    <TableCell className="text-center tabular-nums">{formatNumber(row.rop)}</TableCell>
                    <TableCell className="text-center tabular-nums">{formatNumber(row.maxSaleQty)}</TableCell>
                    <TableCell className="text-center">
                      <ErpPresenceCell inErp={row.inErp1} />
                    </TableCell>
                    <TableCell className="text-center">
                      <ErpPresenceCell inErp={row.inErp2} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
      </CardContent>
    </Card>
    </div>
  );
}
