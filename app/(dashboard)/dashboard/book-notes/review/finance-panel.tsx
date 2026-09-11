"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ImageIcon,
  Loader2,
  NotebookPen,
  Search,
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
import type {
  BookNoteFinanceDay,
  BookNoteFinanceSummary,
  BookNoteLocationOption,
  BookNoteReceiptDto,
} from "@/lib/book-notes/types";
import { formatAppDateTimeShort } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

const ALL_SHOPS = "__all__";
const ALL_COMPANIES = "__all_companies__";

function money(value: number): string {
  return value.toLocaleString("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A receipt plus the day it belongs to, for the flat photo view. */
type PhotoItem = BookNoteReceiptDto & {
  shopName: string;
  posting_date: string;
  submittedBy: string;
};

type PanelProps = {
  initialLocations: BookNoteLocationOption[];
  initialDays: BookNoteFinanceDay[];
  initialSummary: BookNoteFinanceSummary;
  initialTruncated: boolean;
  initialFrom: string;
  initialTo: string;
  today: string;
};

export function BookNoteFinancePanel({
  initialLocations,
  initialDays,
  initialSummary,
  initialTruncated,
  initialFrom,
  initialTo,
  today,
}: PanelProps) {
  const [locations] = useState(initialLocations);
  const [days, setDays] = useState(initialDays);
  const [summary, setSummary] = useState(initialSummary);
  const [truncated, setTruncated] = useState(initialTruncated);
  const [companyLocationId, setCompanyLocationId] = useState(ALL_SHOPS);
  const [company, setCompany] = useState(ALL_COMPANIES);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [appliedRange, setAppliedRange] = useState({
    from: initialFrom,
    to: initialTo,
  });
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"notes" | "photos">("notes");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<PhotoItem | null>(null);
  const [filterText, setFilterText] = useState("");

  /** ERP companies merchants submit under, taken from the shop list. */
  const companyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const loc of locations) {
      const label = loc.erpnextCompany?.trim();
      if (label) set.add(label);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [locations]);

  /** Client-side narrowing of the loaded range — shop, date, or invoice no. */
  const visibleDays = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return days;
    return days.filter((day) => {
      if (day.shopName.toLowerCase().includes(q)) return true;
      if (day.company.toLowerCase().includes(q)) return true;
      if (day.posting_date.includes(q)) return true;
      if (day.submittedBy?.name.toLowerCase().includes(q)) return true;
      return day.rows.some((r) =>
        r.sales_invoice.toLowerCase().includes(q),
      );
    });
  }, [days, filterText]);

  const photos = useMemo<PhotoItem[]>(() => {
    return visibleDays.flatMap((day) =>
      day.receipts.map((r) => ({
        ...r,
        shopName: day.shopName,
        posting_date: day.posting_date,
        submittedBy: day.submittedBy?.name ?? "Unknown",
      })),
    );
  }, [visibleDays]);

  function toggleDay(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyFilters() {
    if (from > to) {
      notify.error("From date must be on or before To date");
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ from, to });
      if (companyLocationId !== ALL_SHOPS) {
        params.set("companyLocationId", companyLocationId);
      }
      if (company !== ALL_COMPANIES) {
        params.set("company", company);
      }
      const res = await fetch(`/api/admin/book-notes/review?${params}`);
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load book notes");
        return;
      }
      setDays((data.days as BookNoteFinanceDay[]) ?? []);
      setSummary(data.summary as BookNoteFinanceSummary);
      setTruncated(Boolean(data.truncated));
      setExpanded(new Set());
      setAppliedRange({ from, to });
    } catch {
      notify.error("Failed to load book notes");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Book Notes — Finance Review
        </h1>
        <p className="text-muted-foreground text-sm">
          Merchant book notes for every outlet: payment-method totals, the
          invoice rows behind them, the slips merchants uploaded, and who
          submitted each sheet. Read-only — entry, edits and ERP sends stay with
          the shop.
        </p>
      </div>

      <div className="bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-5">
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            Company
          </label>
          <Select
            value={company}
            disabled={loading || companyOptions.length === 0}
            onValueChange={setCompany}
          >
            <SelectTrigger>
              <SelectValue placeholder="All companies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_COMPANIES}>All companies</SelectItem>
              {companyOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            Outlet
          </label>
          <Select
            value={companyLocationId}
            disabled={loading}
            onValueChange={setCompanyLocationId}
          >
            <SelectTrigger>
              <SelectValue placeholder="All outlets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SHOPS}>All outlets</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.shortName ? `${loc.shortName} — ${loc.name}` : loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            From
          </label>
          <Input
            type="date"
            value={from}
            max={today}
            disabled={loading}
            className="font-medium tabular-nums"
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-muted-foreground text-xs font-medium">
            To
          </label>
          <Input
            type="date"
            value={to}
            max={today}
            disabled={loading}
            className="font-medium tabular-nums"
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            className="w-full"
            disabled={loading}
            onClick={() => void applyFilters()}
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Loading...
              </>
            ) : (
              "Show book notes"
            )}
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-lg border p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            Range summary
          </h2>
          <span className="text-muted-foreground text-xs">
            {appliedRange.from} to {appliedRange.to} · {summary.dayCount} book
            note{summary.dayCount === 1 ? "" : "s"} · {summary.rowCount} invoice
            row{summary.rowCount === 1 ? "" : "s"} · {summary.receiptCount} photo
            {summary.receiptCount === 1 ? "" : "s"}
          </span>
        </div>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {summary.methods.map((m) => (
            <div
              key={m.method}
              className="bg-muted/30 rounded-md border px-3 py-2"
            >
              <dt className="text-muted-foreground flex items-baseline justify-between gap-2 text-xs font-medium">
                <span>{m.method}</span>
                <span className="tabular-nums">x{m.count}</span>
              </dt>
              <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">
                {money(m.total)}
              </dd>
            </div>
          ))}
          <div className="border-primary/40 bg-primary/5 rounded-md border px-3 py-2">
            <dt className="text-xs font-semibold uppercase tracking-wide">
              Grand total
            </dt>
            <dd className="mt-1 font-mono text-lg font-bold tabular-nums">
              {money(summary.grandTotal)}
            </dd>
          </div>
        </dl>
        {truncated ? (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            Showing the newest 200 book notes in this range — narrow the dates or
            pick one outlet to see the rest.
          </p>
        ) : null}
      </div>

      {summary.companies.length > 0 ? (
        <div className="bg-card rounded-lg border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
              By company
            </h2>
            <span className="text-muted-foreground text-xs">
              Merchants submit company-wise — these are the totals per ERP
              company
            </span>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-2">Company</th>
                  <th className="p-2 text-right">Book notes</th>
                  <th className="p-2 text-right">Rows</th>
                  <th className="p-2 text-right">Cash</th>
                  <th className="p-2 text-right">Card</th>
                  <th className="p-2 text-right">KOKO</th>
                  <th className="p-2 text-right">Bank</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-center">Photos</th>
                </tr>
              </thead>
              <tbody>
                {summary.companies.map((c) => (
                  <tr key={c.company} className="border-b last:border-0">
                    <td className="p-2 font-medium">{c.company}</td>
                    <td className="p-2 text-right font-mono">{c.dayCount}</td>
                    <td className="p-2 text-right font-mono">{c.rowCount}</td>
                    {["Cash", "Card", "KOKO", "Bank Transfer"].map((m) => {
                      const bucket = c.methods.find((x) => x.method === m);
                      return (
                        <td
                          key={m}
                          className="p-2 text-right font-mono tabular-nums"
                        >
                          {bucket && bucket.total > 0 ? (
                            <>
                              {money(bucket.total)}
                              <span className="text-muted-foreground ml-1 text-[10px]">
                                x{bucket.count}
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-2 text-right font-mono font-semibold tabular-nums">
                      {money(c.grandTotal)}
                    </td>
                    <td className="p-2 text-center text-xs">
                      {c.receiptCount > 0 ? (
                        c.receiptCount
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          <Button
            type="button"
            variant={view === "notes" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("notes")}
          >
            <NotebookPen className="h-4 w-4" />
            Book notes ({visibleDays.length})
          </Button>
          <Button
            type="button"
            variant={view === "photos" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("photos")}
          >
            <ImageIcon className="h-4 w-4" />
            Photos ({photos.length})
          </Button>
        </div>
        <div className="relative w-full sm:w-72">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={filterText}
            placeholder="Filter shop, date, invoice, person…"
            aria-label="Filter loaded book notes"
            className="pl-8"
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
      </div>

      {view === "notes" ? (
        visibleDays.length === 0 ? (
          <div className="bg-card text-muted-foreground rounded-lg border p-8 text-center text-sm">
            No book notes saved for this outlet and date range.
          </div>
        ) : (
          <div className="bg-card overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-2 w-8" />
                  <th className="p-2">Company</th>
                  <th className="p-2">Outlet</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Submitted by</th>
                  <th className="p-2 text-right">Rows</th>
                  <th className="p-2 text-right">Cash</th>
                  <th className="p-2 text-right">Card</th>
                  <th className="p-2 text-right">KOKO</th>
                  <th className="p-2 text-right">Bank</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-center">Photos</th>
                </tr>
              </thead>
              <tbody>
                {visibleDays.map((day) => {
                  const open = expanded.has(day.id);
                  const byMethod = (name: string) =>
                    day.methods.find((m) => m.method === name);
                  return (
                    <Fragment key={day.id}>
                      <tr
                        className="border-b hover:bg-muted/40 cursor-pointer"
                        onClick={() => toggleDay(day.id)}
                      >
                        <td className="p-2 align-middle">
                          {open ? (
                            <ChevronDown className="h-4 w-4" aria-hidden />
                          ) : (
                            <ChevronRight className="h-4 w-4" aria-hidden />
                          )}
                          <span className="sr-only">
                            {open ? "Collapse" : "Expand"} {day.shopName}{" "}
                            {day.posting_date}
                          </span>
                        </td>
                        <td className="p-2 text-xs">{day.company || "—"}</td>
                        <td className="p-2 font-medium">{day.shopName}</td>
                        <td className="p-2 font-mono">{day.posting_date}</td>
                        <td className="p-2 text-xs">
                          <span className="font-medium">
                            {day.submittedBy?.name ?? "—"}
                          </span>
                          {day.submittedBy ? (
                            <span className="text-muted-foreground block">
                              {formatAppDateTimeShort(day.submittedBy.at)}
                            </span>
                          ) : null}
                          {day.lastUpdatedBy ? (
                            <span className="text-muted-foreground block">
                              edited by {day.lastUpdatedBy.name}
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {day.rowCount}
                        </td>
                        {["Cash", "Card", "KOKO", "Bank Transfer"].map((m) => {
                          const bucket = byMethod(m);
                          return (
                            <td
                              key={m}
                              className="p-2 text-right font-mono tabular-nums"
                            >
                              {bucket && bucket.total > 0 ? (
                                <>
                                  {money(bucket.total)}
                                  <span className="text-muted-foreground ml-1 text-[10px]">
                                    x{bucket.count}
                                  </span>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-2 text-right font-mono font-semibold tabular-nums">
                          {money(day.grandTotal)}
                        </td>
                        <td className="p-2 text-center text-xs">
                          {day.receipts.length > 0 ? (
                            day.receipts.length
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={12} className="p-4">
                            <div className="space-y-4">
                              <div className="overflow-x-auto rounded-md border bg-background">
                                <table className="w-full min-w-[720px] text-xs">
                                  <thead>
                                    <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                                      <th className="p-2 w-12">Idx</th>
                                      <th className="p-2">Sales Invoice</th>
                                      <th className="p-2 text-right">Cash</th>
                                      <th className="p-2 text-right">Card</th>
                                      <th className="p-2 text-right">KOKO</th>
                                      <th className="p-2 text-right">Bank</th>
                                      <th className="p-2 text-right">
                                        Row total
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {day.rows.length === 0 ? (
                                      <tr>
                                        <td
                                          colSpan={7}
                                          className="text-muted-foreground p-4 text-center"
                                        >
                                          No invoice rows saved for this day.
                                        </td>
                                      </tr>
                                    ) : (
                                      day.rows.map((r, i) => (
                                        <Fragment key={`${day.id}-${i}`}>
                                          <tr
                                            className={
                                              r.is_multi_method
                                                ? "border-b bg-amber-50/70 dark:bg-amber-950/20"
                                                : "border-b"
                                            }
                                          >
                                            <td className="p-2 font-mono">
                                              {r.idx_no}
                                            </td>
                                            <td className="p-2 font-mono">
                                              {r.sales_invoice}
                                              {r.card_receipt_ref_last4 ? (
                                                <span className="text-muted-foreground ml-2">
                                                  card ••
                                                  {r.card_receipt_ref_last4}
                                                </span>
                                              ) : null}
                                            </td>
                                            <td className="p-2 text-right font-mono tabular-nums">
                                              {r.cash > 0 ? money(r.cash) : "—"}
                                            </td>
                                            <td className="p-2 text-right font-mono tabular-nums">
                                              {r.card > 0 ? money(r.card) : "—"}
                                            </td>
                                            <td className="p-2 text-right font-mono tabular-nums">
                                              {r.koko > 0 ? money(r.koko) : "—"}
                                            </td>
                                            <td className="p-2 text-right font-mono tabular-nums">
                                              {r.bank_transfer > 0
                                                ? money(r.bank_transfer)
                                                : "—"}
                                            </td>
                                            <td className="p-2 text-right font-mono font-semibold tabular-nums">
                                              {money(r.row_total)}
                                            </td>
                                          </tr>
                                          {r.split_lines?.length ? (
                                            <tr className="border-b bg-violet-50/50 dark:bg-violet-950/20">
                                              <td />
                                              <td colSpan={6} className="p-2">
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                                                  Split payment lines
                                                </span>
                                                <ul className="mt-1 space-y-0.5">
                                                  {r.split_lines.map(
                                                    (sl, si) => (
                                                      <li
                                                        key={si}
                                                        className="font-mono text-[11px]"
                                                      >
                                                        {sl.paymentMethod} ={" "}
                                                        {money(sl.amount)}
                                                        {sl.cardLast4
                                                          ? ` · card ••${sl.cardLast4}`
                                                          : ""}
                                                        {sl.kokoReference
                                                          ? ` · KOKO ${sl.kokoReference}`
                                                          : ""}
                                                        {sl.bankReference
                                                          ? ` · bank ${sl.bankReference}`
                                                          : ""}
                                                      </li>
                                                    ),
                                                  )}
                                                </ul>
                                              </td>
                                            </tr>
                                          ) : null}
                                        </Fragment>
                                      ))
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              <div>
                                <h3 className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
                                  Uploaded slips ({day.receipts.length})
                                </h3>
                                {day.receipts.length === 0 ? (
                                  <p className="text-muted-foreground text-xs">
                                    No photos uploaded for this day.
                                  </p>
                                ) : (
                                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
                                    {day.receipts.map((r) => (
                                      <li
                                        key={r.id}
                                        className="bg-background overflow-hidden rounded-md border"
                                      >
                                        <button
                                          type="button"
                                          className="block w-full text-left"
                                          onClick={() =>
                                            setPreview({
                                              ...r,
                                              shopName: day.shopName,
                                              posting_date: day.posting_date,
                                              submittedBy:
                                                day.submittedBy?.name ??
                                                "Unknown",
                                            })
                                          }
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={r.url}
                                            alt={r.fileName}
                                            loading="lazy"
                                            className="h-24 w-full object-cover"
                                          />
                                          <span className="text-muted-foreground block truncate px-2 py-1 text-[10px]">
                                            {r.fileName}
                                          </span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : photos.length === 0 ? (
        <div className="bg-card text-muted-foreground rounded-lg border p-8 text-center text-sm">
          No receipt photos uploaded for this outlet and date range.
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {photos.map((item) => (
            <li
              key={item.id}
              className="bg-card overflow-hidden rounded-md border"
            >
              <button
                type="button"
                className="block w-full text-left"
                onClick={() => setPreview(item)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.url}
                  alt={`${item.shopName} ${item.posting_date} — ${item.fileName}`}
                  loading="lazy"
                  className="h-32 w-full object-cover"
                />
                <span className="block px-2 py-1">
                  <span className="block truncate text-[11px] font-medium">
                    {item.shopName}
                  </span>
                  <span className="text-muted-foreground block truncate font-mono text-[10px]">
                    {item.posting_date} · {item.submittedBy}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
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
              {preview?.shopName}
              <span className="text-muted-foreground ml-2 font-mono text-xs font-normal">
                {preview?.posting_date}
              </span>
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
              <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {preview.fileName}
                  {formatBytes(preview.fileSize)
                    ? ` · ${formatBytes(preview.fileSize)}`
                    : ""}{" "}
                  · uploaded by {preview.submittedBy}
                </span>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Open full size
                </a>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
