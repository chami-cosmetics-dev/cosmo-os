"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";

import { priorityLabelClass } from "@/components/organisms/item-trends/priority-label";
import {
  formatNumber,
  HEAD_CLASS,
  SELECT_CLASS,
  TABLE_CLASS,
  TABLE_CONTAINER_CLASS,
} from "@/components/organisms/sales-budget-table-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ShopStockRow } from "@/lib/shop-stock-status/config";
import {
  SHOP_STOCK_PERCENT_OP_LABELS,
  type ShopStockPercentOp,
} from "@/lib/shop-stock-status/filters";
import {
  applyNoRopFilters,
  buildNoRopRows,
  DEFAULT_NO_ROP_FILTERS,
  NO_ROP_CHANNEL_COLUMNS,
  NO_ROP_CHANNEL_LABELS,
  NO_ROP_CHANNELS,
  NO_ROP_SORT_LABELS,
  noRopFiltersActive,
  noRopFilterText,
  type NoRopChannel,
  type NoRopFilters,
  type NoRopRow,
  type NoRopSort,
} from "@/lib/shop-stock-status/no-rop";
import { STOCK_HEALTH_STATUSES, type StockHealthStatus } from "@/lib/stock-health/config";
import { cn } from "@/lib/utils";

const STOCK_OPS = Object.keys(SHOP_STOCK_PERCENT_OP_LABELS) as ShopStockPercentOp[];
const FILTER_SELECT_CLASS = cn(SELECT_CLASS, "min-w-[150px] font-normal text-foreground");
const NUM_CELL_CLASS = "text-right tabular-nums";

/** What the NO ROP tab shows (selected view + rows + filters), for "Export filtered". */
export type NoRopView = { channel: NoRopChannel; rows: NoRopRow[]; filters: string };

/**
 * Items that have stock but no ROP in at least one location of the selected view (Shops, or the
 * online channels), from the Shops / Online tabs' rows, so the same exclusions. Cells show the
 * stock; "-" = that location has a ROP or no stock.
 */
export function ShopStockNoRopTable({
  shopsRows,
  onlineRows,
  loading,
  onViewChange,
}: {
  /** The Shops + Online tab's rows. */
  shopsRows: ShopStockRow[] | null;
  /** The Online tab's rows. */
  onlineRows: ShopStockRow[] | null;
  loading: boolean;
  /** Reports the rows shown + filters (must be a stable callback). */
  onViewChange: (view: NoRopView) => void;
}) {
  const [channel, setChannel] = useState<NoRopChannel>("shops");
  const [filters, setFilters] = useState<NoRopFilters>(DEFAULT_NO_ROP_FILTERS);
  const set = (patch: Partial<NoRopFilters>) => setFilters((prev) => ({ ...prev, ...patch }));
  const columns = NO_ROP_CHANNEL_COLUMNS[channel];

  // Changing the view resets Location (its locations differ); the other filters stay.
  const switchChannel = (next: NoRopChannel) => {
    if (next === channel) return;
    setChannel(next);
    set({ location: "all" });
  };

  const sourceRows = channel === "shops" ? shopsRows : onlineRows;
  const rows = useMemo(
    () => (sourceRows ? buildNoRopRows(sourceRows, columns) : null),
    [sourceRows, columns],
  );
  const shown = useMemo(() => applyNoRopFilters(rows ?? [], filters), [rows, filters]);
  const filterText = useMemo(() => noRopFilterText(filters, channel), [filters, channel]);

  useEffect(() => {
    onViewChange({ channel, rows: shown, filters: filterText });
  }, [onViewChange, channel, shown, filterText]);

  const priorities = useMemo(
    () =>
      STOCK_HEALTH_STATUSES.filter(
        (status) => status !== "Blank" || (rows ?? []).some((row) => row.priority === "Blank"),
      ),
    [rows],
  );

  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="NO ROP view"
        className="inline-flex h-9 items-center rounded-md bg-muted p-1 text-muted-foreground"
      >
        {NO_ROP_CHANNELS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={channel === c}
            onClick={() => switchChannel(c)}
            className={cn(
              "inline-flex h-7 items-center rounded-sm px-3 text-sm font-medium transition-colors",
              channel === c
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground",
            )}
          >
            {NO_ROP_CHANNEL_LABELS[c]}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          SKU / item
          <Input
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder="Search…"
            className="h-9 w-48 font-normal text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Priority
          <select
            className={FILTER_SELECT_CLASS}
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
          Location
          <select
            className={FILTER_SELECT_CLASS}
            value={filters.location}
            onChange={(e) => set({ location: e.target.value })}
          >
            <option value="all">All</option>
            {columns.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Sort by stock
          <select
            className={FILTER_SELECT_CLASS}
            value={filters.sort}
            onChange={(e) => set({ sort: e.target.value as NoRopSort })}
          >
            {(Object.keys(NO_ROP_SORT_LABELS) as NoRopSort[]).map((sort) => (
              <option key={sort} value={sort}>
                {NO_ROP_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span id="shop-stock-no-rop-qty">Stock quantity</span>
          <div className="flex gap-2">
            <select
              aria-labelledby="shop-stock-no-rop-qty"
              className={cn(SELECT_CLASS, "min-w-[110px] font-normal text-foreground")}
              value={filters.stockOp}
              onChange={(e) => set({ stockOp: e.target.value as ShopStockPercentOp })}
            >
              {STOCK_OPS.map((op) => (
                <option key={op} value={op}>
                  {SHOP_STOCK_PERCENT_OP_LABELS[op]}
                </option>
              ))}
            </select>
            <Input
              type="number"
              inputMode="decimal"
              aria-label="Stock quantity value"
              value={filters.stockValue}
              onChange={(e) => set({ stockValue: e.target.value })}
              placeholder="Qty"
              className="h-9 w-20 font-normal text-foreground"
            />
          </div>
        </div>
        {noRopFiltersActive(filters) ? (
          <Button variant="ghost" size="sm" onClick={() => setFilters(DEFAULT_NO_ROP_FILTERS)}>
            <X className="mr-1 h-4 w-4" />
            Clear
          </Button>
        ) : null}
        <p className="ml-auto text-xs text-muted-foreground">
          {rows ? `${formatNumber(shown.length)} of ${formatNumber(rows.length)} items` : ""}
        </p>
      </div>

      <Table
        containerClassName={cn(TABLE_CONTAINER_CLASS, loading && rows && "opacity-60")}
        className={TABLE_CLASS}
      >
        <TableHeader className="sticky top-0 z-10">
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(HEAD_CLASS, "min-w-[220px] text-left")}>Item / Priority</TableHead>
            {columns.map((column) => (
              <TableHead key={column.key} className={cn(HEAD_CLASS, "w-[84px]")}>
                {column.label}
              </TableHead>
            ))}
            <TableHead className={cn(HEAD_CLASS, "w-[90px]")}>Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 2} className="h-32 text-center">
                {loading ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-sm text-muted-foreground">{rows ? "No matches." : "No data."}</span>
                )}
              </TableCell>
            </TableRow>
          ) : (
            shown.map((row) => (
              <TableRow key={row.commonSku}>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs">{row.commonSku}</span>
                    <span
                      className={cn(
                        "inline-flex select-none items-center rounded-full px-1.5 py-px text-[10px] font-semibold ring-1 ring-inset",
                        priorityLabelClass(row.priority),
                      )}
                    >
                      {row.priority}
                    </span>
                  </div>
                  {row.itemName ? <div className="text-xs text-muted-foreground">{row.itemName}</div> : null}
                </TableCell>
                {columns.map((column) => {
                  const stock = row.cells[column.key];
                  return stock == null ? (
                    <TableCell key={column.key} className="text-center text-muted-foreground">
                      -
                    </TableCell>
                  ) : (
                    <TableCell key={column.key} className={NUM_CELL_CLASS}>
                      {formatNumber(stock)}
                    </TableCell>
                  );
                })}
                <TableCell className={cn(NUM_CELL_CLASS, "font-semibold")}>{formatNumber(row.total)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
