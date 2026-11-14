"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { priorityLabelClass } from "@/components/organisms/item-trends/priority-label";
import {
  formatNumber,
  HEAD_CLASS,
  SELECT_CLASS,
  TABLE_CLASS,
} from "@/components/organisms/sales-budget-table-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  STOCK_HEALTH_STATUSES,
  type StockHealthOutOfStock,
  type StockHealthStatus,
} from "@/lib/stock-health/config";
import { cn } from "@/lib/utils";

export type StockHealthOutOfStockFilter = StockHealthStatus | "all";

/**
 * The Common SKUs behind ROP Status's 0' Stock numbers: same data, one row each. The filter
 * lives in the panel, so a 0' Stock link can set it.
 */
export function StockHealthOutOfStockCard({
  reloadKey,
  filter,
  onFilterChange,
}: {
  /** Bump to reload (after an ERP refresh or an excluded-SKU change). */
  reloadKey: number;
  filter: StockHealthOutOfStockFilter;
  onFilterChange: (filter: StockHealthOutOfStockFilter) => void;
}) {
  const [data, setData] = useState<StockHealthOutOfStock | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/purchasing/stock-health/out-of-stock");
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Failed to load out-of-stock items");
        if (active) setData(body as StockHealthOutOfStock);
      } catch (error) {
        if (active) {
          notify.error(error instanceof Error ? error.message : "Failed to load out-of-stock items");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const countOf = (status: StockHealthStatus) =>
    (data?.rows ?? []).filter((row) => row.status === status).length;
  const shown = useMemo(
    () => (data?.rows ?? []).filter((row) => filter === "all" || row.status === filter),
    [data, filter],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Out of Stock</CardTitle>
          <p className="text-xs text-muted-foreground">
            {data
              ? `${formatNumber(shown.length)} Common SKU${shown.length === 1 ? "" : "s"} with no stock across their variants (website drafts with no stock left out), live ERP stock as of ${formatAppIsoDateTime(data.fetchedAt)}.`
              : "Common SKUs with no stock across their variants."}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Priority Status
          <select
            className={cn(SELECT_CLASS, "font-normal text-foreground")}
            value={filter}
            onChange={(e) => onFilterChange(e.target.value as StockHealthOutOfStockFilter)}
          >
            <option value="all">All ({formatNumber(data?.rows.length ?? 0)})</option>
            {STOCK_HEALTH_STATUSES.filter(
              // Blank only when it has rows (or a 0' Stock link selected it).
              (status) => status !== "Blank" || countOf(status) > 0 || filter === status,
            ).map((status) => (
              <option key={status} value={status}>
                {status} ({formatNumber(countOf(status))})
              </option>
            ))}
          </select>
        </label>
      </CardHeader>
      <CardContent>
        <div className={cn("overflow-x-auto rounded-md border", loading && data && "opacity-60")}>
          <Table className={cn(TABLE_CLASS, "min-w-[800px]")}>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(HEAD_CLASS, "w-[130px]")}>Priority Status</TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-[170px]")}>Common SKU</TableHead>
                <TableHead className={HEAD_CLASS}>Item name</TableHead>
                <TableHead className={HEAD_CLASS}>Available variant SKUs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                    {loading ? (
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {data ? "No out-of-stock items." : "No data."}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((row) => (
                  <TableRow key={row.commonSku}>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex select-none items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                          priorityLabelClass(row.status),
                        )}
                      >
                        {row.status}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.commonSku}</TableCell>
                    <TableCell className="whitespace-normal">{row.itemName ?? "-"}</TableCell>
                    <TableCell className="whitespace-normal font-mono text-xs">
                      {row.variantSkus.join(", ")}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
