"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw } from "lucide-react";

import { priorityLabelClass } from "@/components/organisms/item-trends/priority-label";
import {
  downloadFile,
  formatNumber,
  formatPercent,
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
import { formatAppIsoDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import type {
  StockHealthRopCounts,
  StockHealthRopStatus,
  StockHealthStatus,
} from "@/lib/stock-health/config";
import { cn } from "@/lib/utils";

const NUM_CELL_CLASS = "text-right tabular-nums";

/** Column bands: each group's count + % share one colour so they read as a pair. */
type Band = { head: string; cell: string; pct: string; edge: string };

const BANDS = {
  fail: {
    head: "bg-rose-500/25 text-rose-900 dark:text-rose-100",
    cell: "bg-rose-500/[0.07] font-medium text-rose-700 dark:text-rose-300",
    pct: "bg-rose-500/[0.07] text-rose-700/75 dark:text-rose-300/75",
    edge: "border-l-2 border-l-rose-500/60",
  },
  noRopNoStock: {
    head: "bg-slate-500/25 text-slate-900 dark:text-slate-100",
    cell: "bg-slate-500/[0.07] font-medium",
    pct: "bg-slate-500/[0.07] text-muted-foreground",
    edge: "border-l-2 border-l-slate-500/60",
  },
  noRopWithStock: {
    head: "bg-amber-500/25 text-amber-900 dark:text-amber-100",
    cell: "bg-amber-500/[0.07] font-medium text-amber-700 dark:text-amber-300",
    pct: "bg-amber-500/[0.07] text-amber-700/75 dark:text-amber-300/75",
    edge: "border-l-2 border-l-amber-500/60",
  },
  pass: {
    head: "bg-emerald-500/25 text-emerald-900 dark:text-emerald-100",
    cell: "bg-emerald-500/[0.07] font-medium text-emerald-700 dark:text-emerald-300",
    pct: "bg-emerald-500/[0.07] text-emerald-700/75 dark:text-emerald-300/75",
    edge: "border-l-2 border-l-emerald-500/60",
  },
  total: {
    head: "bg-sky-500/25 text-sky-900 dark:text-sky-100",
    cell: "bg-sky-500/10 font-bold",
    pct: "",
    edge: "border-x-2 border-x-sky-500/60",
  },
  zeroStock: {
    head: "bg-orange-500/25 text-orange-900 dark:text-orange-100",
    cell: "bg-orange-500/[0.07] font-medium",
    pct: "bg-orange-500/[0.07] text-orange-700/75 dark:text-orange-300/75",
    edge: "border-l-2 border-l-orange-500/60",
  },
} satisfies Record<string, Band>;

const GROUP_COLUMNS: Array<{
  key: "fail" | "noRopNoStock" | "noRopWithStock" | "pass";
  label: string;
  pctLabel: string;
}> = [
  { key: "pass", label: "PASS", pctLabel: "PASS %" },
  { key: "fail", label: "FAIL", pctLabel: "FAIL %" },
  { key: "noRopWithStock", label: "No ROP - With Stock", pctLabel: "%" },
  { key: "noRopNoStock", label: "No ROP - No Stock", pctLabel: "%" },
];

function share(count: number, total: number): string {
  return total > 0 ? formatPercent((count / total) * 100) : "-";
}

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

function CountCells({
  counts,
  onOpenZeroStock,
}: {
  counts: StockHealthRopCounts;
  onOpenZeroStock: () => void;
}) {
  return (
    <>
      {GROUP_COLUMNS.map((col) => (
        <GroupCells
          key={col.key}
          band={BANDS[col.key]}
          count={counts[col.key]}
          total={counts.total}
        />
      ))}
      <TableCell className={cn(NUM_CELL_CLASS, BANDS.total.cell, BANDS.total.edge)}>
        {formatNumber(counts.total)}
      </TableCell>
      <TableCell className={cn(NUM_CELL_CLASS, BANDS.zeroStock.cell, BANDS.zeroStock.edge)}>
        {/* Opens the Out of Stock tab, which lists these SKUs. */}
        <button
          type="button"
          onClick={onOpenZeroStock}
          className="text-orange-700 underline decoration-dotted underline-offset-2 hover:decoration-solid dark:text-orange-300"
          title="Open in Out of Stock"
        >
          {formatNumber(counts.zeroStock)}
        </button>
      </TableCell>
      <TableCell className={cn(NUM_CELL_CLASS, BANDS.zeroStock.pct)}>
        {share(counts.zeroStock, counts.total)}
      </TableCell>
    </>
  );
}

function GroupCells({ band, count, total }: { band: Band; count: number; total: number }) {
  return (
    <>
      <TableCell className={cn(NUM_CELL_CLASS, band.cell, band.edge)}>{formatNumber(count)}</TableCell>
      <TableCell className={cn(NUM_CELL_CLASS, band.pct)}>{share(count, total)}</TableCell>
    </>
  );
}

/**
 * ROP Status: each Common SKU in one group by total stock / total ROP (all variants).
 * 0' Stock overlaps the groups and is not part of the Grand Total.
 */
export function StockHealthRopStatusCard({
  reloadKey = 0,
  onRefreshed,
  onOpenOutOfStock,
}: {
  /** Bump to reload (after an ERP refresh or an excluded-SKU change). */
  reloadKey?: number;
  /** Called after Refresh rebuilt the ERP data (Weekly Summary uses the same data). */
  onRefreshed?: () => void;
  /** 0' Stock link — status row, or null for the Grand Total row. */
  onOpenOutOfStock: (status: StockHealthStatus | null) => void;
}) {
  const [data, setData] = useState<StockHealthRopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/purchasing/stock-health/rop-status${refresh ? "?refresh=1" : ""}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load ROP status");
      setData(body as StockHealthRopStatus);
      return true;
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to load ROP status");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load, reloadKey]);

  const downloadBreakdown = async () => {
    setDownloading(true);
    try {
      await downloadFile(
        "/api/admin/purchasing/stock-health/rop-status/export",
        "stock-health-rop-status.xlsx",
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
          <CardTitle className="text-base">ROP Status</CardTitle>
          <p className="text-xs text-muted-foreground">
            {data
              ? `Live ERP stock vs OSF ROP (website drafts with no stock left out) as of ${formatAppIsoDateTime(data.fetchedAt)}. PASS = stock above 50% of ROP. 0' Stock overlaps the groups and is not in the Grand Total.`
              : "Common SKUs by stock against ROP."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Live ERP figures (same cache as the table) — per Common SKU and per ERP SKU. */}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(true).then((ok) => ok && onRefreshed?.())}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            {loading ? "Loading ERP stock…" : "Refresh"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className={cn("overflow-x-auto rounded-md border", loading && data && "opacity-60")}>
          <Table className={cn(TABLE_CLASS, "min-w-[1100px]")}>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className={HEAD_CLASS}>Priority Status</TableHead>
                <TableHead colSpan={11} className={cn(HEAD_CLASS, "text-sm")}>
                  {data?.month ?? ""}
                </TableHead>
              </TableRow>
              <TableRow>
                {GROUP_COLUMNS.flatMap((col) => [
                  <TableHead key={col.key} className={cn(HEAD_CLASS, BANDS[col.key].head, BANDS[col.key].edge)}>
                    {col.label}
                  </TableHead>,
                  <TableHead key={`${col.key}-pct`} className={cn(HEAD_CLASS, BANDS[col.key].head)}>
                    {col.pctLabel}
                  </TableHead>,
                ])}
                <TableHead className={cn(HEAD_CLASS, BANDS.total.head, BANDS.total.edge)}>Grand Total</TableHead>
                <TableHead className={cn(HEAD_CLASS, BANDS.zeroStock.head, BANDS.zeroStock.edge)}>0&apos; Stock</TableHead>
                <TableHead className={cn(HEAD_CLASS, BANDS.zeroStock.head)}>0&apos; Stock %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-32 text-center">
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
                    <TableRow key={row.status}>
                      <TableCell><StatusChip status={row.status} /></TableCell>
                      <CountCells counts={row} onOpenZeroStock={() => onOpenOutOfStock(row.status)} />
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/60 font-semibold hover:bg-muted/60">
                    <TableCell>Grand Total</TableCell>
                    <CountCells counts={data.grandTotal} onOpenZeroStock={() => onOpenOutOfStock(null)} />
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
