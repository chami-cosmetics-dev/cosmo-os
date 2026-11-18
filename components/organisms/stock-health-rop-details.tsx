"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2, X } from "lucide-react";

import { priorityLabelClass } from "@/components/organisms/item-trends/priority-label";
import {
  downloadFile,
  formatNumber,
  formatPercent,
  HEAD_CLASS,
  SELECT_CLASS,
  TABLE_CLASS,
  TABLE_CONTAINER_CLASS,
} from "@/components/organisms/sales-budget-table-ui";
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
import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import {
  SHOP_STOCK_PERCENT_OP_LABELS,
  type ShopStockPercentOp,
} from "@/lib/shop-stock-status/filters";
import type { StockHealthRopGroup } from "@/lib/stock-health/calc";
import { STOCK_HEALTH_ROP_ROW_ORDER, type StockHealthStatus } from "@/lib/stock-health/config";
import {
  applyRopDetailsFilters,
  DEFAULT_ROP_DETAILS_FILTERS,
  ROP_DETAILS_SORT_LABELS,
  ROP_DETAILS_STATUS_LABELS,
  ROP_DETAILS_STATUSES,
  ropDetailsFiltersActive,
  type RopDetailsFilters,
  type RopDetailsSort,
  type StockHealthRopDetails,
} from "@/lib/stock-health/rop-details";
import { cn } from "@/lib/utils";

const NUM_CELL_CLASS = "text-right tabular-nums";
/** Reorder Qty (PASS / FAIL only): stands out from the other numbers. */
const REORDER_CELL_CLASS =
  "bg-orange-500/15 font-bold text-orange-700 dark:bg-orange-500/20 dark:text-orange-300";
const PERCENT_OPS = Object.keys(SHOP_STOCK_PERCENT_OP_LABELS) as ShopStockPercentOp[];

/** Same colours as the ROP Status table's group columns. */
const STATUS_CLASS: Record<StockHealthRopGroup, string> = {
  pass: "text-emerald-700 dark:text-emerald-300",
  fail: "text-rose-700 dark:text-rose-300",
  noRopWithStock: "text-amber-700 dark:text-amber-300",
  noRopNoStock: "text-muted-foreground",
};

/**
 * Every Common SKU behind the ROP Status numbers: same data, same rows, one row each. The filters
 * live in the panel, so a click on a ROP Status number can set them.
 */
export function StockHealthRopDetailsCard({
  reloadKey,
  filters,
  onFiltersChange,
}: {
  /** Bump to reload (after an ERP refresh or an excluded-SKU change). */
  reloadKey: number;
  filters: RopDetailsFilters;
  onFiltersChange: (filters: RopDetailsFilters) => void;
}) {
  const [data, setData] = useState<StockHealthRopDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/purchasing/stock-health/rop-details");
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Failed to load ROP details");
        if (active) setData(body as StockHealthRopDetails);
      } catch (error) {
        if (active) {
          notify.error(error instanceof Error ? error.message : "Failed to load ROP details");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const set = (patch: Partial<RopDetailsFilters>) => onFiltersChange({ ...filters, ...patch });

  const priorities = STOCK_HEALTH_ROP_ROW_ORDER.filter(
    // Blank only when it has rows (or a ROP Status click selected it), as in ROP Status.
    (status) =>
      status !== "Blank" ||
      filters.priority === status ||
      (data?.rows ?? []).some((row) => row.priority === "Blank"),
  );

  const shown = useMemo(() => applyRopDetailsFilters(data?.rows ?? [], filters), [data, filters]);

  const exportFiltered = async () => {
    setExporting(true);
    try {
      await downloadFile(
        "/api/admin/purchasing/stock-health/rop-details/export",
        "stock-health-rop-details.xlsx",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(filters),
        },
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">ROP Details</CardTitle>
            <p className="text-xs text-muted-foreground">
              {data
                ? `Each Common SKU in ROP Status, with its stock against ROP (website drafts with no stock left out), live ERP stock as of ${formatAppIsoDateTime(data.fetchedAt)}. PASS = stock above 50% of ROP.`
                : "Each Common SKU in ROP Status, with its stock against ROP."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportFiltered()}
            disabled={exporting || loading || !data}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exporting ? "Preparing…" : "Export filtered"}
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Priority
            <select
              className={cn(SELECT_CLASS, "min-w-[150px] font-normal text-foreground")}
              value={filters.priority}
              onChange={(e) => set({ priority: e.target.value as StockHealthStatus | "all" })}
            >
              <option value="all">All</option>
              {priorities.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Status
            <select
              className={cn(SELECT_CLASS, "min-w-[170px] font-normal text-foreground")}
              value={filters.status}
              onChange={(e) => set({ status: e.target.value as StockHealthRopGroup | "all" })}
            >
              <option value="all">All</option>
              {ROP_DETAILS_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {ROP_DETAILS_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            <span id="rop-details-percent">Percentage</span>
            <div className="flex gap-2">
              <select
                aria-labelledby="rop-details-percent"
                className={cn(SELECT_CLASS, "min-w-[110px] font-normal text-foreground")}
                value={filters.percentOp}
                onChange={(e) => set({ percentOp: e.target.value as ShopStockPercentOp })}
              >
                {PERCENT_OPS.map((op) => (
                  <option key={op} value={op}>
                    {SHOP_STOCK_PERCENT_OP_LABELS[op]}
                  </option>
                ))}
              </select>
              <Input
                type="number"
                inputMode="decimal"
                aria-label="Percentage value"
                value={filters.percentValue}
                onChange={(e) => set({ percentValue: e.target.value })}
                placeholder="%"
                className="h-9 w-20 font-normal text-foreground"
              />
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Sort by %
            <select
              className={cn(SELECT_CLASS, "min-w-[160px] font-normal text-foreground")}
              value={filters.sort}
              onChange={(e) => set({ sort: e.target.value as RopDetailsSort })}
            >
              {(Object.keys(ROP_DETAILS_SORT_LABELS) as RopDetailsSort[]).map((sort) => (
                <option key={sort} value={sort}>
                  {ROP_DETAILS_SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
          {ropDetailsFiltersActive(filters) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFiltersChange(DEFAULT_ROP_DETAILS_FILTERS)}
            >
              <X className="mr-1 h-4 w-4" />
              Clear
            </Button>
          ) : null}
          <p className="ml-auto text-xs text-muted-foreground">
            {data
              ? `${formatNumber(shown.length)} of ${formatNumber(data.rows.length)} Common SKUs`
              : ""}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {/* Own scroll box (max 70vh) so the header row stays visible while scrolling. */}
        <Table
          containerClassName={cn(TABLE_CONTAINER_CLASS, loading && data && "opacity-60")}
          className={cn(TABLE_CLASS, "min-w-[900px]")}
        >
          <TableHeader className="sticky top-0 z-10">
            <TableRow>
              <TableHead className={cn(HEAD_CLASS, "text-left")}>Common SKU / Item name</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[170px]")}>Status</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[90px]")}>Stock</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[90px]")}>ROP</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[110px]")}>Reorder Qty</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[110px]")}>Stock % of ROP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  {loading ? (
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {data ? "No items match these filters." : "No data."}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              shown.map((row) => (
                <TableRow key={row.commonSku}>
                  {/* As on Item Trends: SKU + priority label, the item name on its own line below. */}
                  <TableCell className="whitespace-normal">
                    <div className="font-mono font-bold">
                      <span className="select-all">{row.commonSku}</span>
                      <span
                        className={cn(
                          "ml-2 inline-flex select-none items-center rounded-full px-2 py-0.5 font-sans text-xs font-semibold ring-1 ring-inset",
                          priorityLabelClass(row.priority),
                        )}
                      >
                        {row.priority}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{row.itemName ?? "-"}</div>
                  </TableCell>
                  <TableCell className={cn("font-medium", STATUS_CLASS[row.status])}>
                    {ROP_DETAILS_STATUS_LABELS[row.status]}
                  </TableCell>
                  <TableCell className={NUM_CELL_CLASS}>{formatNumber(row.stock)}</TableCell>
                  <TableCell className={NUM_CELL_CLASS}>{formatNumber(row.rop)}</TableCell>
                  {row.reorderQty == null ? (
                    <TableCell className="text-center text-muted-foreground">-</TableCell>
                  ) : (
                    <TableCell className={cn(NUM_CELL_CLASS, REORDER_CELL_CLASS)}>
                      {formatNumber(row.reorderQty)}
                    </TableCell>
                  )}
                  <TableCell className={cn(NUM_CELL_CLASS, row.percent == null && "text-center text-muted-foreground")}>
                    {formatPercent(row.percent)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
