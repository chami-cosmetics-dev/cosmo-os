"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";

import { priorityLabelClass } from "@/components/organisms/item-trends/priority-label";
import {
  downloadFile,
  formatNumber,
  HEAD_CLASS,
  TABLE_CLASS,
} from "@/components/organisms/sales-budget-table-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAppDate, formatAppIsoDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import type { StockHealthStatus, StockHealthWeeklySummary } from "@/lib/stock-health/config";
import { cn } from "@/lib/utils";

const NUM_CELL_CLASS = "text-right tabular-nums";

function StatusChip({ status }: { status: StockHealthStatus }) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
        priorityLabelClass(status),
      )}
    >
      {status}
    </span>
  );
}

const TOTAL_ROW_CLASS = "bg-muted/60 font-semibold hover:bg-muted/60";

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function ChangeCell({ value }: { value: number }) {
  return (
    <TableCell
      className={cn(
        NUM_CELL_CLASS,
        value > 0 && "text-emerald-600 dark:text-emerald-400",
        value < 0 && "text-rose-600 dark:text-rose-400",
      )}
    >
      {value > 0 ? "+ " : value < 0 ? "- " : ""}
      {formatNumber(Math.abs(value))}
    </TableCell>
  );
}

/** Snapshot dates are Colombo calendar days (YYYY-MM-DD). */
function formatSnapshotDate(date: string) {
  return formatAppDate(`${date}T12:00:00+05:30`);
}

/** Weekly Summary: count + current stock per priority status, week over week once 2 weekly snapshots are saved. */
export function StockHealthWeeklySummaryCard({
  reloadKey = 0,
  onRefreshed,
}: {
  /** Bump to reload (e.g. after the excluded SKUs change). */
  reloadKey?: number;
  /** Called after Refresh rebuilt the ERP data (other tables use the same data). */
  onRefreshed?: () => void;
}) {
  const [data, setData] = useState<StockHealthWeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/purchasing/stock-health/weekly-summary${refresh ? "?refresh=1" : ""}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load weekly summary");
      setData(body as StockHealthWeeklySummary);
      return true;
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to load weekly summary");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load, reloadKey]);

  const [downloading, setDownloading] = useState(false);
  const downloadBreakdown = async () => {
    setDownloading(true);
    try {
      await downloadFile(
        "/api/admin/purchasing/stock-health/weekly-summary/export",
        "stock-health-breakdown.xlsx",
      );
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Weekly Summary</CardTitle>
          <p className="text-xs text-muted-foreground">
            {data?.mode === "weekly"
              ? `Week of ${formatSnapshotDate(data.previousDate)} vs week of ${formatSnapshotDate(data.currentDate)}`
              : data?.mode === "current"
                ? `Live ERP figures (website drafts with no stock left out) as of ${formatAppIsoDateTime(data.fetchedAt)}.`
                : "Common SKUs per priority status and their current stock."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">          {/* Live ERP figures (same cache as the table) — per Common SKU and per ERP SKU. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void downloadBreakdown()}
            disabled={downloading || loading}
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {downloading ? "Preparing…" : "Download breakdown"}
          </Button>
          {data?.mode !== "weekly" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true).then((ok) => ok && onRefreshed?.())}
              disabled={loading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
              {loading ? "Loading ERP stock…" : "Refresh"}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          {data?.mode === "weekly" ? (
            <Table className={TABLE_CLASS}>
              <TableHeader>
                <TableRow>
                  <TableHead rowSpan={2} className={HEAD_CLASS}>Priority Status</TableHead>
                  <TableHead colSpan={2} className={HEAD_CLASS}>
                    Previous week ({formatSnapshotDate(data.previousDate)})
                  </TableHead>
                  <TableHead colSpan={2} className={HEAD_CLASS}>
                    This week ({formatSnapshotDate(data.currentDate)})
                  </TableHead>
                  <TableHead colSpan={2} className={HEAD_CLASS}>Change</TableHead>
                </TableRow>
                <TableRow>
                  {["prev", "this", "change"].flatMap((group) => [
                    <TableHead key={`${group}-count`} className={HEAD_CLASS}>Count</TableHead>,
                    <TableHead key={`${group}-stock`} className={HEAD_CLASS}>Current Stock</TableHead>,
                  ])}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.status}>
                    <TableCell><StatusChip status={row.status} /></TableCell>
                    <TableCell className={NUM_CELL_CLASS}>{formatNumber(row.previous.count)}</TableCell>
                    <TableCell className={NUM_CELL_CLASS}>{formatNumber(row.previous.stock)}</TableCell>
                    <TableCell className={NUM_CELL_CLASS}>{formatNumber(row.current.count)}</TableCell>
                    <TableCell className={NUM_CELL_CLASS}>{formatNumber(row.current.stock)}</TableCell>
                    <ChangeCell value={row.change.count} />
                    <ChangeCell value={row.change.stock} />
                  </TableRow>
                ))}
                <TableRow className={TOTAL_ROW_CLASS}>
                  <TableCell>Grand Total</TableCell>
                  <TableCell className={NUM_CELL_CLASS}>{formatNumber(sum(data.rows, (r) => r.previous.count))}</TableCell>
                  <TableCell className={NUM_CELL_CLASS}>{formatNumber(sum(data.rows, (r) => r.previous.stock))}</TableCell>
                  <TableCell className={NUM_CELL_CLASS}>{formatNumber(sum(data.rows, (r) => r.current.count))}</TableCell>
                  <TableCell className={NUM_CELL_CLASS}>{formatNumber(sum(data.rows, (r) => r.current.stock))}</TableCell>
                  <ChangeCell value={sum(data.rows, (r) => r.change.count)} />
                  <ChangeCell value={sum(data.rows, (r) => r.change.stock)} />
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <Table className={TABLE_CLASS}>
              <TableHeader>
                <TableRow>
                  <TableHead className={HEAD_CLASS}>Priority Status</TableHead>
                  <TableHead className={HEAD_CLASS}>Count</TableHead>
                  <TableHead className={HEAD_CLASS}>Current Stock</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-32 text-center">
                      {loading ? (
                        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                      ) : (
                        <span className="text-sm text-muted-foreground">No data.</span>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {data.rows.map((row) => (
                      <TableRow key={row.status} className={loading ? "opacity-60" : undefined}>
                        <TableCell><StatusChip status={row.status} /></TableCell>
                        <TableCell className={NUM_CELL_CLASS}>{formatNumber(row.count)}</TableCell>
                        <TableCell className={NUM_CELL_CLASS}>{formatNumber(row.stock)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className={cn(TOTAL_ROW_CLASS, loading && "opacity-60")}>
                      <TableCell>Grand Total</TableCell>
                      <TableCell className={NUM_CELL_CLASS}>{formatNumber(sum(data.rows, (r) => r.count))}</TableCell>
                      <TableCell className={NUM_CELL_CLASS}>{formatNumber(sum(data.rows, (r) => r.stock))}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
