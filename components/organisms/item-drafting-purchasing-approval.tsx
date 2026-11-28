"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, RefreshCw, RotateCcw, X } from "lucide-react";

import {
  BLANK_FILTER_VALUE,
  ColumnFilter,
  type ColumnSortDir,
} from "@/components/molecules/column-filter";
import { priorityLabelClass } from "@/components/organisms/item-trends/priority-label";
import {
  formatNumber,
  HEAD_CLASS,
  SELECT_CLASS,
  TABLE_CLASS,
  TABLE_CONTAINER_CLASS,
} from "@/components/organisms/sales-budget-table-ui";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  applicableErps,
  isApprovedStage,
  matchesPurchasingApprovalFilter,
  PRESENT_IN_LABELS,
  PURCHASING_APPROVAL_FILTER_LABELS,
  PURCHASING_APPROVAL_FILTERS,
  STAGE_LABELS,
  type DiscontinueErp,
  type PurchasingApprovalData,
  type PurchasingApprovalFilter,
  type PurchasingApprovalRow,
} from "@/lib/discontinued-items/purchasing-approval";
import { formatAppDateTimeShort, formatAppIsoDateTime } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

const API = "/api/admin/discontinued-items/purchasing-approval";
const ERP_LABELS: Record<DiscontinueErp, string> = { erp1: "ERP 1 / Website", erp2: "ERP 2" };

type PendingClick = { row: PurchasingApprovalRow; erp: DiscontinueErp; remark: string };

/** Columns with an Excel-style filter. */
const COLUMN_KEYS = ["item", "maxSale", "presentIn", "erp1", "erp2", "remark", "status"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];

/** An ERP button's state as text: Done / Done (test) / To disable / Not in ERP. */
function erpStateOf(row: PurchasingApprovalRow, erp: DiscontinueErp): string {
  const doneAt = erp === "erp1" ? row.erp1DisabledDate : row.erp2DisabledDate;
  if (doneAt) return (erp === "erp1" ? row.erp1DryRun : row.erp2DryRun) ? "Done (test)" : "Done";
  return applicableErps(row.presentIn).includes(erp) ? "To disable" : "Not in ERP";
}

/** The value a column filter lists / matches for a row (what the cell shows, as text). */
function columnValueOf(row: PurchasingApprovalRow, key: ColumnKey): string {
  switch (key) {
    case "item":
      return row.productTitle ? `${row.sku} · ${row.productTitle}` : row.sku;
    case "maxSale":
      return row.maxSaleQty == null ? BLANK_FILTER_VALUE : String(row.maxSaleQty);
    case "presentIn":
      return row.presentIn ? PRESENT_IN_LABELS[row.presentIn] : BLANK_FILTER_VALUE;
    case "erp1":
      return erpStateOf(row, "erp1");
    case "erp2":
      return erpStateOf(row, "erp2");
    case "remark":
      return row.disableReason?.trim() || BLANK_FILTER_VALUE;
    case "status":
      return STAGE_LABELS[row.stage];
  }
}

export function ItemDraftingPurchasingApproval({
  canAct,
  canResetTest,
  onItemsChanged,
  reloadKey = 0,
  filterRequest,
}: {
  /** Has the Purchasing Approval permission (Manager alone is view-only). */
  canAct: boolean;
  canResetTest: boolean;
  /** A click / reset / Refresh changed items: reload the other tabs, badges and reminder bubbles. */
  onItemsChanged?: () => void;
  /** Bumped when another tab changed or refreshed items. */
  reloadKey?: number;
  /** From the Dashboard: show this status group (a new nonce applies it again). */
  filterRequest?: { filter: PurchasingApprovalFilter; nonce: number };
}) {
  const [data, setData] = useState<PurchasingApprovalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PurchasingApprovalFilter>(filterRequest?.filter ?? "open");
  // A Dashboard click while this tab is open: apply its filter (adjusting state during render).
  const [seenRequest, setSeenRequest] = useState(filterRequest?.nonce ?? 0);
  if (filterRequest && filterRequest.nonce !== seenRequest) {
    setSeenRequest(filterRequest.nonce);
    setFilter(filterRequest.filter);
  }
  const [search, setSearch] = useState("");
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<PendingClick | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnKey, Set<string>>>>({});
  const [columnSort, setColumnSort] = useState<{ key: ColumnKey; dir: ColumnSortDir } | null>(null);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}${refresh ? "?refresh=1" : ""}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load items");
      setData(body as PurchasingApprovalData);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load items");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const remarkOf = (row: PurchasingApprovalRow) => remarks[row.sku] ?? row.disableReason ?? "";

  // Rows after the status dropdown + search; the column filters' value lists come from these.
  const baseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (row) =>
        matchesPurchasingApprovalFilter(row.stage, filter) &&
        (!q || row.sku.toLowerCase().includes(q) || (row.productTitle ?? "").toLowerCase().includes(q)),
    );
  }, [data, filter, search]);

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
    return [...rows].sort((a, b) => {
      if (key === "maxSale") return ((a.maxSaleQty ?? -1) - (b.maxSaleQty ?? -1)) * factor;
      return columnValueOf(a, key).localeCompare(columnValueOf(b, key), undefined, { numeric: true }) * factor;
    });
  }, [baseRows, columnFilters, columnSort]);

  const anyColumnFilter = COLUMN_KEYS.some((key) => columnFilters[key]) || columnSort !== null;

  /** Header label + its Excel-style filter. */
  const headerWithFilter = (key: ColumnKey, label: string, align: "left" | "center" = "center") => (
    <div className={cn("flex items-center gap-1", align === "center" ? "justify-center" : "justify-start")}>
      <span>{label}</span>
      <ColumnFilter
        label={label}
        values={columnValues[key]}
        selected={columnFilters[key] ?? null}
        onChange={(next) => setColumnFilters((prev) => ({ ...prev, [key]: next ?? undefined }))}
        sortDir={columnSort && columnSort.key === key ? columnSort.dir : null}
        onSort={(dir) => setColumnSort(dir ? { key, dir } : null)}
        numeric={key === "maxSale"}
      />
    </div>
  );

  const pendingCount = useMemo(
    () => (data?.rows ?? []).filter((row) => row.stage === "PENDING").length,
    [data],
  );

  function requestClick(row: PurchasingApprovalRow, erp: DiscontinueErp) {
    const remark = remarkOf(row).trim();
    if (!remark) {
      notify.error(`Enter a remark for ${row.sku} before disabling it.`);
      return;
    }
    setConfirm({ row, erp, remark });
  }

  async function runClick(click: PendingClick) {
    setConfirm(null);
    setBusy(`${click.row.sku}::${click.erp}`);
    try {
      const res = await fetch(`${API}/disable`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: click.row.sku, erp: click.erp, remark: click.remark }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to disable the item");
      const updated = body.row as PurchasingApprovalRow;
      setData((prev) =>
        prev ? { ...prev, rows: prev.rows.map((r) => (r.sku === updated.sku ? updated : r)) } : prev,
      );
      notify.success(
        `${updated.sku}: ${ERP_LABELS[click.erp]} done${body.testMode ? " (test, no ERP changed)" : ""}.`,
      );
      onItemsChanged?.();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to disable the item");
    } finally {
      setBusy(null);
    }
  }

  async function resetTest() {
    setBusy("reset");
    try {
      const res = await fetch(`${API}/reset-test`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to reset");
      setRemarks({});
      notify.success(`Reset ${body.reset} test row(s).`);
      await load();
      onItemsChanged?.();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to reset");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-lg">Purchasing Approval</CardTitle>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-500/60 dark:text-amber-200">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {pendingCount} pending
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU or name"
              className="h-9 w-52"
            />
            <select
              className={SELECT_CLASS}
              value={filter}
              onChange={(e) => setFilter(e.target.value as PurchasingApprovalFilter)}
              aria-label="Status filter"
            >
              {PURCHASING_APPROVAL_FILTERS.map((f) => (
                <option key={f} value={f}>
                  {PURCHASING_APPROVAL_FILTER_LABELS[f]}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(true).then((ok) => ok && onItemsChanged?.())}
              disabled={loading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>
        {data?.testMode && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-sky-500/50 bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-100">
            <FlaskConical className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              <span className="font-semibold">Test mode:</span> buttons are a dry run. The click is saved,
              but no item is disabled in any ERP.
            </span>
            {canResetTest && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={() => void resetTest()}
                disabled={busy !== null}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                Reset test clicks
              </Button>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Variant SKUs with Product Priority “Discontinue” and 0 stock across every warehouse.
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
      </CardHeader>
      <CardContent>
          <Table containerClassName={TABLE_CONTAINER_CLASS} className={TABLE_CLASS}>
            <TableHeader className="sticky top-0 z-10">
              <TableRow>
                <TableHead className={cn(HEAD_CLASS, "min-w-[280px] text-left")}>
                  {headerWithFilter("item", "Item", "left")}
                </TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-[66px] text-center")}>
                  {headerWithFilter("maxSale", "Max Sale Qty")}
                </TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-[90px]")}>
                  {headerWithFilter("presentIn", "Present in")}
                </TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-[110px]")}>
                  {headerWithFilter("erp1", "ERP 1 / Website")}
                </TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-[110px]")}>
                  {headerWithFilter("erp2", "ERP 2")}
                </TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-[220px]")}>
                  {headerWithFilter("remark", "Remark")}
                </TableHead>
                <TableHead className={cn(HEAD_CLASS, "w-[120px]")}>
                  {headerWithFilter("status", "Status")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !data ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Reading ERP items and stock. The first load can take a few minutes.
                    </p>
                  </TableCell>
                </TableRow>
              ) : error && !data ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-destructive">
                    {error}
                  </TableCell>
                </TableRow>
              ) : shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                    No items.
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((row) => {
                  const pending = row.stage === "PENDING";
                  const approved = isApprovedStage(row.stage);
                  return (
                    <TableRow
                      key={row.sku}
                      className={cn(pending && "bg-amber-500/10 hover:bg-amber-500/15")}
                    >
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap items-center gap-2">
                          {pending && (
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0 text-amber-600"
                              aria-label="Pending: one ERP still to disable"
                            />
                          )}
                          <span className="font-mono text-xs">{row.sku}</span>
                          {row.priorityStatus && (
                            <span
                              className={cn(
                                "inline-flex select-none items-center rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 ring-1 ring-inset",
                                priorityLabelClass(row.priorityStatus),
                              )}
                            >
                              {row.priorityStatus}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm leading-snug">{row.productTitle ?? "-"}</p>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{formatNumber(row.maxSaleQty)}</TableCell>
                      <TableCell className="text-center text-xs">
                        {row.presentIn ? PRESENT_IN_LABELS[row.presentIn] : "-"}
                      </TableCell>
                      {(["erp1", "erp2"] as const).map((erp) => (
                        <TableCell key={erp}>
                          <div className="flex justify-center">
                            <ErpButton
                              row={row}
                              erp={erp}
                              canAct={canAct} 
                              busy={busy === `${row.sku}::${erp}`}
                              disabledAll={busy !== null}
                              onClick={() => requestClick(row, erp)}
                            />
                          </div>
                        </TableCell>
                      ))}
                      <TableCell>
                        <div className="relative">
                          <Input
                            value={remarkOf(row)}
                            onChange={(e) => setRemarks((prev) => ({ ...prev, [row.sku]: e.target.value }))}
                            placeholder="Required"
                            maxLength={500}
                            disabled={!canAct || approved}
                            className="h-8 pr-7 text-xs"
                            aria-label={`Remark for ${row.sku}`}
                          />
                          {canAct && !approved && remarkOf(row) && (
                            <button
                              type="button"
                              onClick={() => setRemarks((prev) => ({ ...prev, [row.sku]: "" }))}
                              className="absolute right-1.5 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label={`Clear remark for ${row.sku}`}
                              title="Clear remark"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                            pending && "bg-amber-500/20 text-amber-800 ring-amber-500/60 dark:text-amber-200",
                            approved && "bg-emerald-500/15 text-emerald-800 ring-emerald-500/50 dark:text-emerald-200",
                            !pending && !approved && "bg-muted text-muted-foreground ring-border",
                          )}
                        >
                          {STAGE_LABELS[row.stage]}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
      </CardContent>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure? This cannot be undone.</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  Disable <span className="font-mono font-semibold">{confirm.row.sku}</span> in{" "}
                  <span className="font-semibold">{ERP_LABELS[confirm.erp]}</span>.
                  {data?.testMode && " Test mode: the click is saved, but no ERP is changed."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && void runClick(confirm)}>
              Yes, disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function ErpButton({
  row,
  erp,
  canAct,
  busy,
  disabledAll,
  onClick,
}: {
  row: PurchasingApprovalRow;
  erp: DiscontinueErp;
  canAct: boolean;
  busy: boolean;
  disabledAll: boolean;
  onClick: () => void;
}) {
  const doneAt = erp === "erp1" ? row.erp1DisabledDate : row.erp2DisabledDate;
  const doneBy = erp === "erp1" ? row.erp1DisabledBy : row.erp2DisabledBy;
  const dryRun = erp === "erp1" ? row.erp1DryRun : row.erp2DryRun;

  if (doneAt) {
    return (
      <div className="space-y-0.5">
        <Button size="sm" variant="outline" disabled className="h-8 gap-1 text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          Done{dryRun ? " (test)" : ""}
        </Button>
        <p className="text-[11px] leading-tight text-muted-foreground">
          {doneBy ?? "-"} · {formatAppDateTimeShort(doneAt)}
        </p>
      </div>
    );
  }

  const applicable = applicableErps(row.presentIn).includes(erp);
  return (
    <Button
      size="sm"
      variant={applicable ? "destructive" : "outline"}
      className="h-8"
      disabled={!applicable || !canAct || disabledAll}
      title={applicable ? undefined : `Not in ${ERP_LABELS[erp]}`}
      onClick={onClick}
    >
      {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
      {applicable ? "Disable" : "Not in ERP"}
    </Button>
  );
}
