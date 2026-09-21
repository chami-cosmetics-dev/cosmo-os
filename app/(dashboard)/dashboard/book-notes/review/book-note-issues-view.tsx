"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BOOK_NOTE_ISSUE_STATUSES,
  BOOK_NOTE_ISSUE_STATUS_LABELS,
  type BookNoteIssueRow,
  type BookNoteIssueStatus,
  type BookNoteIssuesAggregate,
} from "@/lib/book-notes/issue-types";
import { formatAppDateTimeShort } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

const POLL_MS = 45_000;
const ALL_STATUSES = "__all__";

function formatAge(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "amount_mismatch":
      return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
    case "category_mismatch":
      return "bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200";
    case "no_payment_entry_linked":
      return "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200";
    case "sales_invoice_not_found":
      return "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200";
    case "no_invoice_number":
      return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function issueKey(erpInstanceId: string, issue: BookNoteIssueRow): string {
  return `${erpInstanceId}::${issue.name}`;
}

type Props = {
  today: string;
  onTotalChange?: (total: number) => void;
};

export function BookNoteIssuesView({ today, onTotalChange }: Props) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [status, setStatus] = useState<string>(ALL_STATUSES);
  const [applied, setApplied] = useState({
    dateFrom: "",
    dateTo: "",
    status: ALL_STATUSES as string,
  });
  const [data, setData] = useState<BookNoteIssuesAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{
    url: string;
    fileName: string;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (opts?.silent) setRefreshing(true);
      else setLoading(true);

      try {
        const params = new URLSearchParams();
        if (applied.dateFrom) params.set("date_from", applied.dateFrom);
        if (applied.dateTo) params.set("date_to", applied.dateTo);
        if (applied.status !== ALL_STATUSES) {
          params.set("status", applied.status);
        }
        const qs = params.toString();
        const res = await fetch(
          `/api/admin/book-notes/issues${qs ? `?${qs}` : ""}`,
          { signal: ac.signal, cache: "no-store" },
        );
        const json = (await res.json()) as BookNoteIssuesAggregate & {
          error?: string;
        };
        if (!res.ok) {
          if (!opts?.silent) {
            notify.error(json.error ?? "Failed to load book note issues");
          }
          return;
        }
        setData(json);
        onTotalChange?.(json.totalIssues);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!opts?.silent) notify.error("Failed to load book note issues");
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [applied, onTotalChange],
  );

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      void load({ silent: true });
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (!document.hidden) void load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  function applyFilters() {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      notify.error("From date must be on or before To date");
      return;
    }
    setApplied({ dateFrom, dateTo, status });
  }

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-4">
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            Status
          </label>
          <Select value={status} disabled={loading} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
              {BOOK_NOTE_ISSUE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {BOOK_NOTE_ISSUE_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            Verified from
          </label>
          <Input
            type="date"
            value={dateFrom}
            max={today}
            disabled={loading}
            className="font-medium tabular-nums"
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            Verified to
          </label>
          <Input
            type="date"
            value={dateTo}
            max={today}
            disabled={loading}
            className="font-medium tabular-nums"
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            className="flex-1"
            disabled={loading}
            onClick={() => applyFilters()}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Loading…
              </>
            ) : (
              "Show issues"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={loading || refreshing}
            aria-label="Refresh now"
            onClick={() => void load({ silent: true })}
          >
            <RefreshCw
              className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
          </Button>
        </div>
      </div>

      {data ? (
        <div className="bg-card rounded-lg border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-muted-foreground text-sm font-semibold tracking-wide uppercase">
              Open issues
            </h2>
            <span className="text-muted-foreground text-xs">
              {data.totalIssues} open
              {data.autoClearedCount > 0
                ? ` · ${data.autoClearedCount} auto-cleared`
                : ""}
              {" · "}
              Updated {formatAppDateTimeShort(data.fetchedAt)}
              {refreshing ? " · refreshing…" : ""}
            </span>
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {BOOK_NOTE_ISSUE_STATUSES.map((s) => (
              <div
                key={s}
                className="bg-muted/30 rounded-md border px-3 py-2"
              >
                <dt className="text-muted-foreground text-xs font-medium">
                  {BOOK_NOTE_ISSUE_STATUS_LABELS[s]}
                </dt>
                <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">
                  {data.byStatus[s]}
                </dd>
              </div>
            ))}
          </dl>
          {data.sites.length > 0 ? (
            <ul className="text-muted-foreground mt-3 flex flex-wrap gap-3 text-xs">
              {data.sites.map((site) => (
                <li key={site.erpInstanceId}>
                  {site.ok ? (
                    <span>
                      {site.siteLabel}: {site.totalIssues} issue
                      {site.totalIssues === 1 ? "" : "s"}
                    </span>
                  ) : (
                    <span className="text-amber-700 dark:text-amber-400">
                      {site.siteLabel}: unavailable
                      {site.error ? ` — ${site.error.slice(0, 80)}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground mt-3 text-xs">
              No ERP instances configured for this company.
            </p>
          )}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="bg-card text-muted-foreground flex items-center justify-center gap-2 rounded-lg border p-8 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading issues from ERP…
        </div>
      ) : !data || data.totalIssues === 0 ? (
        <div className="bg-card text-muted-foreground rounded-lg border p-8 text-center text-sm">
          {data?.sites.some((s) => !s.ok) && data.totalIssues === 0
            ? "No open issues from reachable ERPs (some sites failed — see above)."
            : "No open book note issues. Fixed rows clear automatically on the next poll."}
        </div>
      ) : (
        <div className="space-y-4">
          {data.sites.map((site) => {
            if (!site.ok || site.totalIssues === 0) return null;
            return (
              <div key={site.erpInstanceId} className="space-y-2">
                <h3 className="text-sm font-semibold tracking-tight">
                  {site.siteLabel}
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    {site.totalIssues} issue
                    {site.totalIssues === 1 ? "" : "s"}
                  </span>
                </h3>
                {site.companies.map((company) => (
                  <div
                    key={`${site.erpInstanceId}-${company.company}`}
                    className="bg-card overflow-x-auto rounded-lg border"
                  >
                    <div className="border-b px-3 py-2 text-sm font-medium">
                      {company.company}
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        {company.issues_count} issue
                        {company.issues_count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <table className="w-full min-w-[960px] text-sm">
                      <thead>
                        <tr className="text-muted-foreground border-b text-left text-xs uppercase tracking-wide">
                          <th className="w-8 p-2" />
                          <th className="p-2">Status</th>
                          <th className="p-2">Invoice</th>
                          <th className="p-2">Outlet / warehouse</th>
                          <th className="p-2">Sales person</th>
                          <th className="p-2 text-right">Typed</th>
                          <th className="p-2 text-right">PE</th>
                          <th className="p-2 text-right">Invoice</th>
                          <th className="p-2">Reason</th>
                          <th className="p-2 text-right">Age</th>
                        </tr>
                      </thead>
                      <tbody>
                        {company.issues.map((issue) => {
                          const key = issueKey(site.erpInstanceId, issue);
                          const open = expanded.has(key);
                          return (
                            <Fragment key={key}>
                              <tr
                                className="hover:bg-muted/40 cursor-pointer border-b last:border-0"
                                onClick={() => toggle(key)}
                              >
                                <td className="p-2">
                                  {open ? (
                                    <ChevronDown className="text-muted-foreground h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                                  )}
                                </td>
                                <td className="p-2">
                                  <span
                                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${statusBadgeClass(issue.status)}`}
                                  >
                                    {issue.status_label ??
                                      (isStatus(issue.status)
                                        ? BOOK_NOTE_ISSUE_STATUS_LABELS[
                                            issue.status
                                          ]
                                        : issue.status)}
                                  </span>
                                  {issue.auto_cleared ? (
                                    <span className="text-muted-foreground ml-1 text-[10px]">
                                      cleared
                                    </span>
                                  ) : null}
                                </td>
                                <td className="p-2 font-mono text-xs">
                                  {issue.sales_invoice ?? "—"}
                                  {issue.posting_date ? (
                                    <span className="text-muted-foreground block text-[10px]">
                                      {issue.posting_date}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="p-2">
                                  <span className="font-medium">
                                    {issue.outlet ?? "—"}
                                  </span>
                                  {issue.warehouse ? (
                                    <span className="text-muted-foreground block text-xs">
                                      {issue.warehouse}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="p-2 text-xs">
                                  {issue.sales_person ?? "—"}
                                  {issue.invoice_customer ? (
                                    <span className="text-muted-foreground block">
                                      {issue.invoice_customer}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="p-2 text-right font-mono tabular-nums text-xs">
                                  {issue.typed_total_display ?? "—"}
                                </td>
                                <td className="p-2 text-right font-mono tabular-nums text-xs">
                                  {issue.pe_allocated_total_display ?? "—"}
                                </td>
                                <td className="p-2 text-right font-mono tabular-nums text-xs">
                                  {issue.invoice_grand_total_display ?? "—"}
                                </td>
                                <td className="p-2 max-w-[220px] text-xs">
                                  <span className="line-clamp-2">
                                    {issue.issue_reason ?? "—"}
                                  </span>
                                  {issue.possible_swap_with ? (
                                    <span className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                                      <AlertTriangle className="h-3 w-3 shrink-0" />
                                      Possible swap: {issue.possible_swap_with}
                                    </span>
                                  ) : null}
                                  {(issue.actual_categories.length > 0 ||
                                    issue.expected_categories.length > 0) &&
                                  issue.status === "category_mismatch" ? (
                                    <span className="text-muted-foreground mt-0.5 block text-[10px]">
                                      {issue.actual_categories.join(", ") ||
                                        "—"}{" "}
                                      →{" "}
                                      {issue.expected_categories.join(", ") ||
                                        "—"}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="text-muted-foreground p-2 text-right text-xs tabular-nums">
                                  {formatAge(issue.age_minutes)}
                                </td>
                              </tr>
                              {open ? (
                                <tr className="bg-muted/20 border-b">
                                  <td colSpan={10} className="p-3">
                                    <IssueDetail
                                      issue={issue}
                                      onPreview={(img) =>
                                        setPreview({
                                          url: img.file_url,
                                          fileName: img.file_name,
                                        })
                                      }
                                    />
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {preview?.fileName ?? "Receipt"}
            </DialogTitle>
          </DialogHeader>
          {preview ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.fileName}
                className="max-h-[70vh] w-full rounded-md object-contain"
              />
              <a
                href={preview.url}
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground text-xs underline"
              >
                Open original
              </a>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function isStatus(value: string): value is BookNoteIssueStatus {
  return (BOOK_NOTE_ISSUE_STATUSES as readonly string[]).includes(value);
}

function IssueDetail({
  issue,
  onPreview,
}: {
  issue: BookNoteIssueRow;
  onPreview: (img: { file_url: string; file_name: string }) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-2 text-xs">
        <h4 className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          Context
        </h4>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Submitted by</dt>
          <dd>{issue.submitted_by ?? "—"}</dd>
          <dt className="text-muted-foreground">PE created by</dt>
          <dd>
            {issue.pe_created_by.length
              ? issue.pe_created_by.join(", ")
              : "—"}
          </dd>
          <dt className="text-muted-foreground">Verified</dt>
          <dd>
            {issue.verified_at
              ? formatAppDateTimeShort(issue.verified_at)
              : "—"}
          </dd>
          <dt className="text-muted-foreground">PE summary</dt>
          <dd>{issue.pe_summary ?? "—"}</dd>
          {issue.difference != null && issue.difference !== 0 ? (
            <>
              <dt className="text-muted-foreground">Difference</dt>
              <dd className="font-mono tabular-nums">
                {issue.difference_display ?? issue.difference}
              </dd>
            </>
          ) : null}
        </dl>
        {issue.invoice_items.length > 0 ? (
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
              Invoice items
            </p>
            <ul className="list-inside list-disc">
              {issue.invoice_items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 text-xs">
        <h4 className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          Payment entries
        </h4>
        {issue.payment_entries.length === 0 ? (
          <p className="text-muted-foreground">None linked</p>
        ) : (
          <ul className="space-y-2">
            {issue.payment_entries.map((pe) => (
              <li key={pe.name} className="rounded border px-2 py-1.5">
                <div className="font-mono font-medium">{pe.name}</div>
                <div className="text-muted-foreground">
                  {pe.mode_of_payment ?? "—"} ·{" "}
                  {pe.amount != null
                    ? pe.amount.toLocaleString("en-LK", {
                        minimumFractionDigits: 2,
                      })
                    : "—"}
                  {pe.account_category
                    ? ` · ${pe.account_category}`
                    : ""}
                </div>
                {pe.account ? (
                  <div className="text-muted-foreground truncate">
                    {pe.account}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {issue.split_lines.length > 0 ? (
          <div>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wide uppercase">
              Typed split lines
            </p>
            <ul className="space-y-1">
              {issue.split_lines.map((sl, i) => (
                <li key={`${sl.payment_method}-${i}`}>
                  {sl.payment_method}:{" "}
                  <span className="font-mono tabular-nums">
                    {sl.amount_display ?? sl.amount}
                  </span>
                  {sl.card_last_4 ? ` · ****${sl.card_last_4}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 text-xs">
        <h4 className="text-muted-foreground text-[10px] font-semibold tracking-wide uppercase">
          Receipts ({issue.receipt_images.length})
        </h4>
        {issue.receipt_images.length === 0 ? (
          <p className="text-muted-foreground">No receipt images</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {issue.receipt_images.map((img) => (
              <li key={img.file_url}>
                <button
                  type="button"
                  className="hover:ring-primary/40 block w-full overflow-hidden rounded border hover:ring-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview(img);
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.file_url}
                    alt={img.file_name}
                    className="h-24 w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
