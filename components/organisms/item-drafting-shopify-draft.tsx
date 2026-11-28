"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FlaskConical,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";

import {
  BLANK_FILTER_VALUE,
  ColumnFilter,
  type ColumnSortDir,
} from "@/components/molecules/column-filter";
import { priorityLabelClass } from "@/components/organisms/item-trends/priority-label";
import {
  formatNumber,
  HEAD_CLASS,
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
import type { ShopifyDraftGroup } from "@/lib/discontinued-items/dashboard-summary";
import { EXPECTED_SEARCH_CONSOLE_FILTERS } from "@/lib/discontinued-items/search-console";
import {
  REDIRECTION_LINK_MAX,
  type ShopifyDraftData,
  type ShopifyDraftRow,
} from "@/lib/discontinued-items/shopify-draft";
import { formatAppDateTimeShort } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

const API = "/api/admin/discontinued-items/shopify-draft";
const COLUMNS = 7;

const COLUMN_KEYS = ["item", "impressions", "clicks", "ctr", "position", "link", "draft"] as const;
type ColumnKey = (typeof COLUMN_KEYS)[number];
const NUMERIC_COLUMNS = new Set<ColumnKey>(["impressions", "clicks", "ctr", "position"]);

const pct = (ctr: number) => `${(ctr * 100).toFixed(2)}%`;
const pos = (value: number) => (value > 0 ? value.toFixed(2) : "0");

function columnValueOf(row: ShopifyDraftRow, key: ColumnKey): string {
  switch (key) {
    case "item":
      return row.productTitle ? `${row.sku} · ${row.productTitle}` : row.sku;
    case "impressions":
      return String(row.impressions);
    case "clicks":
      return String(row.clicks);
    case "ctr":
      return pct(row.ctr);
    case "position":
      return pos(row.avgPosition);
    case "link":
      return row.redirectionLink?.trim() || BLANK_FILTER_VALUE;
    case "draft":
      return draftStateOf(row);
  }
}

/** Dashboard groups → Draft column filter values (same labels as draftStateOf). */
const DRAFT_GROUP_VALUES: Record<ShopifyDraftGroup, readonly string[]> = {
  awaitingDraft: ["To draft"],
  mismatch: ["Mismatch"],
  awaitingCheck: ["Drafted · check pending", "Check failed"],
};

/** The Draft column's state: To draft / Mismatch / Drafted · check pending / Check failed. */
function draftStateOf(row: ShopifyDraftRow): string {
  if (!row.draftClickedDate) return row.mismatch ? "Mismatch" : "To draft";
  return row.attempts[0]?.result === "CHECK_FAILED" ? "Check failed" : "Drafted · check pending";
}

function numericOf(row: ShopifyDraftRow, key: ColumnKey): number {
  if (key === "impressions") return row.impressions;
  if (key === "clicks") return row.clicks;
  if (key === "ctr") return row.ctr;
  return row.avgPosition;
}

export function ItemDraftingShopifyDraft({
  canAct,
  canRecheck = canAct,
  reloadKey = 0,
  onItemsChanged,
  draftFilterRequest,
}: {
  /** Has the Shopify Draft permission (Manager alone is view-only). */
  canAct: boolean;
  /** May re-check failed Shopify checks (Shopify Draft or Manager). */
  canRecheck?: boolean;
  /** Bumped when another tab changed items (e.g. a Purchasing Approval click), to reload the list. */
  reloadKey?: number;
  /** A Draft click / Refresh changed the counts: reload the other tabs, badges and reminder bubbles. */
  onItemsChanged?: () => void;
  /** From the Dashboard: filter the Draft column to this group (a new nonce applies it again). */
  draftFilterRequest?: { group: ShopifyDraftGroup; nonce: number };
}) {
  const [data, setData] = useState<ShopifyDraftData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [links, setLinks] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<ShopifyDraftRow | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [columnFilters, setColumnFilters] = useState<Partial<Record<ColumnKey, Set<string>>>>(() =>
    draftFilterRequest ? { draft: new Set(DRAFT_GROUP_VALUES[draftFilterRequest.group]) } : {},
  );
  const [columnSort, setColumnSort] = useState<{ key: ColumnKey; dir: ColumnSortDir } | null>(null);
  // A Dashboard click while this tab is open: apply its Draft filter (adjusting state during render).
  const [seenRequest, setSeenRequest] = useState(draftFilterRequest?.nonce ?? 0);
  if (draftFilterRequest && draftFilterRequest.nonce !== seenRequest) {
    setSeenRequest(draftFilterRequest.nonce);
    setColumnFilters({ draft: new Set(DRAFT_GROUP_VALUES[draftFilterRequest.group]) });
    setSearch("");
  }
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(API, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to load items");
      setData(body as ShopifyDraftData);
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

  const linkOf = (row: ShopifyDraftRow) => links[row.sku] ?? row.redirectionLink ?? "";
  const hasReport = Boolean(data?.report);

  const baseRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (row) => !q || row.sku.toLowerCase().includes(q) || (row.productTitle ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

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
  const toDraft = (data?.rows ?? []).filter((row) => !row.draftClickedDate).length;
  const mismatchCount = (data?.rows ?? []).filter((row) => row.mismatch).length;
  const checkFailedCount = (data?.rows ?? []).filter(
    (row) => row.draftClickedDate && row.attempts[0]?.result === "CHECK_FAILED",
  ).length;

  const headerWithFilter = (key: ColumnKey, label: string, align: "left" | "center" = "center") => (
    <div className={cn("flex flex-wrap items-center gap-1", align === "center" ? "justify-center" : "justify-start")}>
      <span>{label}</span>
      <ColumnFilter
        label={label}
        values={columnValues[key]}
        selected={columnFilters[key] ?? null}
        onChange={(next) => setColumnFilters((prev) => ({ ...prev, [key]: next ?? undefined }))}
        sortDir={columnSort && columnSort.key === key ? columnSort.dir : null}
        onSort={(dir) => setColumnSort(dir ? { key, dir } : null)}
        numeric={NUMERIC_COLUMNS.has(key)}
      />
    </div>
  );

  async function upload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${API}/search-console`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to process the file");
      setData(body as ShopifyDraftData);
      notify.success("Search Console report processed.");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Failed to process the file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeReport() {
    setConfirmRemove(false);
    setUploading(true);
    setUploadError(null);
    try {
      const res = await fetch(`${API}/search-console`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to remove the report");
      setData(body as ShopifyDraftData);
      notify.success("Search Console report removed.");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Failed to remove the report");
    } finally {
      setUploading(false);
    }
  }

  async function saveLink(row: ShopifyDraftRow) {
    const value = linkOf(row).trim();
    if (value === (row.redirectionLink ?? "")) return;
    try {
      const res = await fetch(`${API}/redirection-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: row.sku, redirectionLink: value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save the link");
      setData((prev) =>
        prev
          ? { ...prev, rows: prev.rows.map((r) => (r.sku === row.sku ? { ...r, redirectionLink: body.redirectionLink } : r)) }
          : prev,
      );
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to save the link");
    }
  }

  /** Re-check now (read-only Shopify lookup) one SKU's failed check, or every failed check. */
  async function recheck(sku: string | null) {
    setBusy(sku ? `recheck:${sku}` : "recheck:all");
    try {
      const res = await fetch(`${API}/recheck`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sku ? { sku } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Re-check failed");
      setData(body.data as ShopifyDraftData);
      const s = body.summary as { checked: number; passed: number; failed: number; checkFailed: number };
      const text = `Checked ${s.checked}: ${s.passed} passed, ${s.failed} mismatch, ${s.checkFailed} still failing.`;
      if (s.checkFailed > 0) notify.error(text);
      else notify.success(text);
      onItemsChanged?.();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Re-check failed");
    } finally {
      setBusy(null);
    }
  }

  async function runDraft(row: ShopifyDraftRow) {
    setConfirm(null);
    setBusy(row.sku);
    try {
      const res = await fetch(`${API}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: row.sku, redirectionLink: linkOf(row) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to record the draft");
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.sku === row.sku
                  ? {
                      ...r,
                      draftClickedDate: body.draftClickedDate,
                      draftClickedBy: body.draftClickedBy,
                      redirectionLink: body.redirectionLink,
                    }
                  : r,
              ),
            }
          : prev,
      );
      notify.success(`${row.sku}: marked as drafted.`);
      onItemsChanged?.();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Failed to record the draft");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-lg">Shopify Draft</CardTitle>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU or name"
              className="h-9 w-52"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load().then((ok) => ok && onItemsChanged?.())}
              disabled={loading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>

        {/* Search Console upload (required before Draft) */}
        <div
          className={cn(
            "space-y-2 rounded-md border px-3 py-2.5 text-xs",
            hasReport
              ? "border-slate-400/30 bg-slate-500/10"
              : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden />
            <span className="font-semibold">Search Console report</span>
            <span className="text-muted-foreground">
              Performance export, filtered:{" "}
              {EXPECTED_SEARCH_CONSOLE_FILTERS.map((f) => `${f.name}: ${f.expected}`).join(" · ")}
            </span>
            {canAct && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
                <Button
                  size="sm"
                  variant={hasReport ? "outline" : "default"}
                  className="ml-auto h-8"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" aria-hidden />
                  )}
                  {hasReport ? "Upload new report" : "Upload report (.xlsx)"}
                </Button>
                {hasReport && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-destructive hover:text-destructive"
                    onClick={() => setConfirmRemove(true)}
                    disabled={uploading}
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    Remove report
                  </Button>
                )}
              </>
            )}
          </div>
          {data?.report ? (
            <p className="flex flex-wrap items-center gap-x-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span className="font-medium">{data.report.fileName}</span>
              <span className="text-muted-foreground">
                {data.report.fileCreatedAt && <>· created {formatAppDateTimeShort(data.report.fileCreatedAt)} </>}
                · uploaded by {data.report.uploadedBy}, {formatAppDateTimeShort(data.report.uploadedAt)} ·{" "}
                {data.report.productRows} product URLs → {data.report.handleCount} products
                {data.report.skippedRows > 0 && ` · ${data.report.skippedRows} rows skipped (not a product page)`}
              </span>
              <span className="font-medium">· Valid today only: removed automatically tomorrow</span>
            </p>
          ) : (
            data && (
              <p className="flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Report required: Draft buttons stay disabled until a Search Console report created today is
                uploaded (a report is valid only if the file was created today).
              </p>
            )
          )}
          {data?.report?.warnings.map((warning) => (
            <p key={warning} className="flex items-start gap-1 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {warning}
            </p>
          ))}
          {uploadError && (
            <p className="flex items-start gap-1 font-medium text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {uploadError}
            </p>
          )}
        </div>

        {(mismatchCount > 0 || checkFailedCount > 0) && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {mismatchCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-800 ring-1 ring-inset ring-red-500/50 dark:text-red-200">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {mismatchCount} mismatch: marked drafted but still not Draft in Shopify
              </span>
            )}
            {checkFailedCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-800 ring-1 ring-inset ring-amber-500/50 dark:text-amber-200">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                {checkFailedCount} check failed
              </span>
            )}
            {checkFailedCount > 0 && canRecheck && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={busy !== null}
                onClick={() => void recheck(null)}
              >
                {busy === "recheck:all" ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
                )}
                Re-check all failed ({checkFailedCount})
              </Button>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Approved by purchasing, on the website (ERP 1 only / both ERPs). Draft only records the click —
          the product is drafted in Shopify by hand. At 5:30 PM on the day of a Draft click, Shopify is checked
          (read only): Draft → done and removed from this list; Active or Archived → Mismatch.
          {data && ` ${toDraft} to draft · ${shown.length} of ${data.rows.length} shown.`}
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
              <TableHead className={cn(HEAD_CLASS, "w-[90px]")}>{headerWithFilter("impressions", "Impressions")}</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[70px]")}>{headerWithFilter("clicks", "Clicks")}</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[70px]")}>{headerWithFilter("ctr", "CTR")}</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[80px]")}>{headerWithFilter("position", "Avg position")}</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[240px]")}>{headerWithFilter("link", "Redirection link")}</TableHead>
              <TableHead className={cn(HEAD_CLASS, "w-[140px]")}>{headerWithFilter("draft", "Draft")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && !data ? (
              <TableRow>
                <TableCell colSpan={COLUMNS} className="h-32 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" aria-hidden />
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
                  No items approved for drafting.
                </TableCell>
              </TableRow>
            ) : (
              shown.map((row) => {
                const drafted = Boolean(row.draftClickedDate);
                const latest = row.attempts[0];
                const checkFailed = drafted && latest?.result === "CHECK_FAILED";
                const lastFail = row.mismatch ? row.attempts.find((a) => a.result === "FAIL") : undefined;
                const earlierAttempts = row.attempts.length - (drafted ? 1 : 0);
                return (
                  <TableRow
                    key={row.sku}
                    className={cn(
                      row.mismatch && "bg-red-500/10 hover:bg-red-500/15",
                      checkFailed && "bg-amber-500/10 hover:bg-amber-500/15",
                    )}
                  >
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap items-center gap-2">
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
                        {row.testApproval && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-500/40 dark:text-sky-200"
                            title="Approved by test-mode clicks: nothing was disabled in the ERPs"
                          >
                            <FlaskConical className="h-3 w-3" aria-hidden />
                            Test
                          </span>
                        )}
                        {row.mismatch && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-800 ring-1 ring-inset ring-red-500/60 dark:text-red-200"
                            title="Marked as drafted, but Shopify still shows the product as not Draft"
                          >
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            Mismatch
                          </span>
                        )}
                        {checkFailed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-500/60 dark:text-amber-200">
                            <AlertTriangle className="h-3 w-3" aria-hidden />
                            Check failed
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm leading-snug">{row.productTitle ?? "-"}</p>
                      {!row.handle && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          No Shopify handle found for this SKU, so Search Console figures are 0.
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{formatNumber(row.impressions)}</TableCell>
                    <TableCell className="text-center tabular-nums">{formatNumber(row.clicks)}</TableCell>
                    <TableCell className="text-center tabular-nums">{pct(row.ctr)}</TableCell>
                    <TableCell className="text-center tabular-nums">{pos(row.avgPosition)}</TableCell>
                    <TableCell>
                      <Input
                        value={linkOf(row)}
                        onChange={(e) => setLinks((prev) => ({ ...prev, [row.sku]: e.target.value }))}
                        onBlur={() => void saveLink(row)}
                        placeholder="Optional"
                        maxLength={REDIRECTION_LINK_MAX}
                        disabled={!canAct || drafted}
                        className="h-8 text-xs"
                        aria-label={`Redirection link for ${row.sku}`}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {drafted ? (
                        <div className="space-y-0.5">
                          <Button size="sm" variant="outline" disabled className="h-8 gap-1 text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                            Drafted
                          </Button>
                          <p className="text-[11px] leading-tight text-muted-foreground">
                            {row.draftClickedBy ?? "-"} · {formatAppDateTimeShort(row.draftClickedDate)}
                          </p>
                          {checkFailed ? (
                            <div className="space-y-1 text-left">
                              <p className="text-[11px] leading-tight text-amber-800 dark:text-amber-200">
                                {latest?.lastError ?? "Shopify check failed."} Retried every 30 min.
                              </p>
                              {canRecheck && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-full text-xs"
                                  disabled={busy !== null}
                                  onClick={() => void recheck(row.sku)}
                                >
                                  {busy === `recheck:${row.sku}` ? (
                                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
                                  ) : (
                                    <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden />
                                  )}
                                  Re-check
                                </Button>
                              )}
                            </div>
                          ) : (
                            <p className="text-[11px] leading-tight text-muted-foreground">
                              Shopify check after{" "}
                              {formatAppDateTimeShort(
                                new Date(new Date(row.draftClickedDate as string).getTime() + 60 * 60 * 1000),
                              )}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          <Button
                            size="sm"
                            className="h-8"
                            disabled={!canAct || !hasReport || busy !== null}
                            title={hasReport ? undefined : "Upload the Search Console report first"}
                            onClick={() => setConfirm(row)}
                          >
                            {busy === row.sku && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Draft
                          </Button>
                          {lastFail && (
                            <p className="text-[11px] leading-tight text-red-700 dark:text-red-300">
                              Still {lastFail.shopifyStatus?.toLowerCase() ?? "not draft"} in Shopify (checked{" "}
                              {formatAppDateTimeShort(lastFail.checkedAt)}). Draft again once it&apos;s drafted.
                            </p>
                          )}
                        </div>
                      )}
                      {earlierAttempts > 0 && (
                        <p
                          className="mt-0.5 text-[10px] leading-tight text-muted-foreground"
                          title={row.attempts
                            .map(
                              (a) =>
                                `${formatAppDateTimeShort(a.clickedAt)} by ${a.clickedBy}: ${a.result.replace("_", " ").toLowerCase()}${a.shopifyStatus ? ` (${a.shopifyStatus})` : ""}`,
                            )
                            .join("\n")}
                        >
                          {earlierAttempts} earlier attempt{earlierAttempts === 1 ? "" : "s"}
                        </p>
                      )}
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
                  Mark <span className="font-mono font-semibold">{confirm.sku}</span> as drafted. This only
                  records the click — draft the product in Shopify yourself.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && void runDraft(confirm)}>Yes, mark drafted</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the Search Console report?</AlertDialogTitle>
            <AlertDialogDescription>
              {data?.report && <span className="font-medium">{data.report.fileName}</span>} will be removed for
              everyone. Draft buttons are disabled until a new report is uploaded, and the Search Console
              figures of items not drafted yet are cleared. Drafted items keep theirs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void removeReport()}>Remove report</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
