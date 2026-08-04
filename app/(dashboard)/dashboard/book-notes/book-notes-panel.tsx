"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  BookNoteDayDto,
  BookNoteHistoryItem,
  BookNoteLocationOption,
  BookNoteOrderSuggestion,
} from "@/lib/book-notes/types";
import { isBookNoteDayLocked } from "@/lib/book-notes/lock";
import { notify } from "@/lib/notify";

type LedgerRow = {
  key: string;
  idxNo: string;
  salesInvoice: string;
  cash: string;
  card: string;
  koko: string;
  bankTransfer: string;
  orderId: string | null;
};

const MAX_CREATE_ROWS = 200;

function toNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function emptyRow(idx: number): LedgerRow {
  return {
    key: `r-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    idxNo: String(idx),
    salesInvoice: "",
    cash: "",
    card: "",
    koko: "",
    bankTransfer: "",
    orderId: null,
  };
}

function makeBlankRows(count: number): LedgerRow[] {
  const n = Math.min(Math.max(Math.floor(count), 0), MAX_CREATE_ROWS);
  if (n === 0) return [];
  return Array.from({ length: n }, (_, i) => emptyRow(i + 1));
}

function dayToRows(day: BookNoteDayDto | null): LedgerRow[] {
  if (!day?.rows?.length) {
    return [];
  }
  return day.rows.map((r, i) => ({
    key: `saved-${day.id}-${i}`,
    idxNo: r.idx_no || String(i + 1),
    salesInvoice: r.sales_invoice,
    cash: r.cash ? String(r.cash) : "",
    card: r.card ? String(r.card) : "",
    koko: r.koko ? String(r.koko) : "",
    bankTransfer: r.bank_transfer ? String(r.bank_transfer) : "",
    orderId: r.orderId ?? null,
  }));
}

type BookNotesPanelProps = {
  initialLocations: BookNoteLocationOption[];
  initialToday: string;
};

export function BookNotesPanel({
  initialLocations,
  initialToday,
}: BookNotesPanelProps) {
  const [locations] = useState(initialLocations);
  const [companyLocationId, setCompanyLocationId] = useState(
    initialLocations[0]?.id ?? "",
  );
  const [postingDate, setPostingDate] = useState(initialToday);
  const [today] = useState(initialToday);
  const [rows, setRows] = useState<LedgerRow[]>(() => []);
  const [rowCountInput, setRowCountInput] = useState("0");
  const [locked, setLocked] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [history, setHistory] = useState<BookNoteHistoryItem[]>([]);
  const [suggestForKey, setSuggestForKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BookNoteOrderSuggestion[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  const isBusy = busyKey !== null;
  const readOnly = locked || isBookNoteDayLocked(postingDate);

  const loadDay = useCallback(async (locationId: string, date: string) => {
    if (!locationId || !date) return;
    setBusyKey("load");
    try {
      const params = new URLSearchParams({
        companyLocationId: locationId,
        postingDate: date,
      });
      const res = await fetch(`/api/admin/book-notes/page-data?${params}`);
      const data = await res.json();
      if (!res.ok) {
        notify.error(data.error ?? "Failed to load book note");
        return;
      }
      const day = data.day as BookNoteDayDto | null;
      const nextRows = dayToRows(day);
      setRows(nextRows);
      setRowCountInput(String(nextRows.length));
      setLocked(Boolean(day?.locked) || isBookNoteDayLocked(date));
      setHistory((data.history as BookNoteHistoryItem[]) ?? []);
      setStatusLine(day ? `Loaded ${day.rows.length} row(s)` : "No saved rows for this day");
    } catch {
      notify.error("Failed to load book note");
    } finally {
      setBusyKey(null);
    }
  }, []);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    if (companyLocationId && postingDate) {
      void loadDay(companyLocationId, postingDate);
    }
  }, [companyLocationId, postingDate, loadDay]);

  function updateRow(key: string, patch: Partial<LedgerRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function createRowsFromCount() {
    if (readOnly) return;
    const n = parseInt(rowCountInput, 10);
    if (!Number.isFinite(n) || n < 0) {
      notify.error("Enter a row count of 0 or more");
      return;
    }
    if (n > MAX_CREATE_ROWS) {
      notify.error(`Maximum ${MAX_CREATE_ROWS} rows`);
      return;
    }
    setRows(makeBlankRows(n));
    setRowCountInput(String(n));
    setStatusLine(n === 0 ? "Cleared rows" : `Created ${n} blank row(s)`);
  }

  function addRow() {
    setRows((prev) => {
      const next = [...prev, emptyRow(prev.length + 1)];
      setRowCountInput(String(next.length));
      return next;
    });
  }

  function removeRow(key: string) {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      setRowCountInput(String(next.length));
      return next;
    });
  }

  function openHistoryDay(item: BookNoteHistoryItem) {
    setPostingDate(item.posting_date);
    setLocked(item.locked || isBookNoteDayLocked(item.posting_date));
    void loadDay(companyLocationId, item.posting_date);
  }

  function fetchSuggestions(rowKey: string, q: string) {
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (q.trim().length < 2 || !companyLocationId) {
      setSuggestions([]);
      setSuggestForKey(null);
      return;
    }
    suggestTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          companyLocationId,
          q: q.trim(),
          postingDate,
        });
        const res = await fetch(`/api/admin/book-notes/order-suggestions?${params}`);
        const data = await res.json();
        if (!res.ok) return;
        setSuggestForKey(rowKey);
        setSuggestions(data.suggestions ?? []);
      } catch {
        // ignore suggestion errors — manual entry still works
      }
    }, 250);
  }

  function applySuggestion(rowKey: string, s: BookNoteOrderSuggestion) {
    updateRow(rowKey, {
      salesInvoice: s.salesInvoice,
      cash: s.cash ? String(s.cash) : "",
      card: s.card ? String(s.card) : "",
      koko: s.koko ? String(s.koko) : "",
      bankTransfer: s.bankTransfer ? String(s.bankTransfer) : "",
      orderId: s.orderId,
    });
    setSuggestions([]);
    setSuggestForKey(null);
  }

  function formatSendError(data: {
    error?: string;
    code?: string;
    step?: string;
    method?: string;
    erpUrl?: string;
    httpStatus?: number;
    locationName?: string;
    postingDate?: string;
  }): string {
    const parts: string[] = [];
    if (data.code) parts.push(`[${data.code}]`);
    if (data.step) parts.push(`step=${data.step}`);
    if (data.httpStatus) parts.push(`HTTP ${data.httpStatus}`);
    if (data.method) parts.push(`method=${data.method}`);
    const head = parts.length ? `${parts.join(" ")} — ` : "";
    const msg = data.error?.trim() || "ERP send failed";
    const where =
      data.locationName || data.postingDate
        ? ` (${[data.locationName, data.postingDate].filter(Boolean).join(" / ")})`
        : "";
    const url = data.erpUrl ? ` → ${data.erpUrl}` : "";
    return `${head}${msg}${where}${url}`;
  }

  function showError(message: string) {
    setLastError(message);
    setStatusLine(message);
    notify.error(message);
  }

  function clearError() {
    setLastError(null);
  }

  async function refreshHistory() {
    try {
      const histParams = new URLSearchParams({
        companyLocationId,
        postingDate,
      });
      const histRes = await fetch(`/api/admin/book-notes/page-data?${histParams}`);
      const histData = await histRes.json();
      if (histRes.ok) {
        setHistory((histData.history as BookNoteHistoryItem[]) ?? []);
      }
    } catch {
      // history refresh is best-effort
    }
  }

  /** Persist current ledger to Cosmo OS. Returns saved day or null on failure. */
  async function saveCurrentDay(): Promise<BookNoteDayDto | null> {
    const payload = {
      companyLocationId,
      postingDate,
      rows: rows.map((r) => ({
        idxNo: r.idxNo,
        salesInvoice: r.salesInvoice.trim(),
        cash: toNum(r.cash),
        card: toNum(r.card),
        koko: toNum(r.koko),
        bankTransfer: toNum(r.bankTransfer),
        orderId: r.orderId,
      })),
    };
    const res = await fetch("/api/admin/book-notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg =
        data.code === "DAY_LOCKED"
          ? `Day locked — ${data.error ?? "cannot save"}`
          : (data.error ?? "Save failed");
      showError(msg);
      if (data.code === "DAY_LOCKED") setLocked(true);
      return null;
    }
    clearError();
    const day = data as BookNoteDayDto;
    setRows(dayToRows(day));
    setRowCountInput(String(day.rows.length));
    setLocked(day.locked);
    await refreshHistory();
    return day;
  }

  async function sendDayToErp(dateYmd: string): Promise<boolean> {
    const res = await fetch("/api/admin/book-notes/send-to-erp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyLocationId,
        postingDate: dateYmd,
      }),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      showError(
        `ERP send failed — response was not JSON (HTTP ${res.status}). Check Cosmo server logs.`,
      );
      return false;
    }
    if (!res.ok) {
      showError(
        formatSendError({
          error: typeof data.error === "string" ? data.error : undefined,
          code: typeof data.code === "string" ? data.code : undefined,
          step: typeof data.step === "string" ? data.step : undefined,
          method: typeof data.method === "string" ? data.method : undefined,
          erpUrl: typeof data.erpUrl === "string" ? data.erpUrl : undefined,
          httpStatus:
            typeof data.httpStatus === "number"
              ? data.httpStatus
              : res.status,
          locationName:
            typeof data.locationName === "string" ? data.locationName : undefined,
          postingDate:
            typeof data.postingDate === "string" ? data.postingDate : dateYmd,
        }),
      );
      return false;
    }
    clearError();
    const s = data.summary as {
      verified_count?: number;
      mismatch_count?: number;
      not_found_count?: number;
      total_rows?: number;
    } | null;
    const line = s
      ? `ERP ${dateYmd}: ${s.verified_count ?? 0} verified, ${s.mismatch_count ?? 0} mismatch, ${s.not_found_count ?? 0} not found (of ${s.total_rows ?? 0})`
      : `Sent ${dateYmd} to ERP`;
    setStatusLine(line);
    notify.success(line);
    return true;
  }

  /** Save then push to ERP (any date ≤ today). */
  async function handleSaveAndSendToErp() {
    if (!companyLocationId) return;
    if (readOnly) {
      showError(
        "This sales date is locked. Pick today or a past date to save and send.",
      );
      return;
    }

    const filled = rows.some(
      (r) =>
        r.salesInvoice.trim() ||
        toNum(r.cash) + toNum(r.card) + toNum(r.koko) + toNum(r.bankTransfer) > 0,
    );
    if (!filled) {
      showError("Add at least one invoice row before sending to ERP");
      return;
    }

    setBusyKey(`erp:${postingDate}`);
    clearError();
    setStatusLine("Saving and sending to ERP...");
    try {
      const day = await saveCurrentDay();
      if (!day) return;
      if (day.rows.length === 0) {
        showError("Nothing to send — add invoice rows first");
        return;
      }
      await sendDayToErp(postingDate);
    } catch (err) {
      showError(
        err instanceof Error
          ? `Network/client error: ${err.message}`
          : "Save / ERP send failed (network/client error)",
      );
    } finally {
      setBusyKey(null);
    }
  }

  /** Resend an already-saved history day (no edit). */
  async function handleResendHistoryToErp(dateYmd: string) {
    if (!companyLocationId || !dateYmd) return;
    setBusyKey(`erp:${dateYmd}`);
    clearError();
    setStatusLine(`Sending ${dateYmd} to ERP...`);
    try {
      await sendDayToErp(dateYmd);
    } catch (err) {
      showError(
        err instanceof Error
          ? `Network/client error: ${err.message}`
          : "ERP send failed (network/client error)",
      );
    } finally {
      setBusyKey(null);
    }
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.cash += toNum(r.cash);
      acc.card += toNum(r.card);
      acc.koko += toNum(r.koko);
      acc.bank += toNum(r.bankTransfer);
      return acc;
    },
    { cash: 0, card: 0, koko: 0, bank: 0 },
  );
  const grand = totals.cash + totals.card + totals.koko + totals.bank;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Daily Book Note</h1>
        <p className="text-muted-foreground text-sm">
          Enter shop invoices and payment splits as recorded in the physical
          book. Pick any sales date up to today, then send to ERP. Matching
          against ERP happens later on the finance side.
        </p>
      </div>

      <div className="bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Shop</label>
          <Select
            value={companyLocationId}
            disabled={isBusy}
            onValueChange={(id) => {
              setCompanyLocationId(id);
              clearError();
              void loadDay(id, postingDate);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select shop" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.shortName ? `${loc.shortName} — ${loc.name}` : loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <Input
            type="date"
            value={postingDate}
            disabled={isBusy}
            max={today}
            onChange={(e) => {
              const next = e.target.value;
              setPostingDate(next);
              setLocked(isBookNoteDayLocked(next));
              void loadDay(companyLocationId, next);
            }}
          />
          {readOnly && (
            <p className="text-amber-700 dark:text-amber-400 text-xs">
              Future dates are locked. Choose today or a past date ({today} or
              earlier).
            </p>
          )}
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Rows
          </label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={MAX_CREATE_ROWS}
              inputMode="numeric"
              value={rowCountInput}
              disabled={isBusy || readOnly}
              className="w-24"
              onChange={(e) => setRowCountInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  createRowsFromCount();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={isBusy || readOnly}
              onClick={createRowsFromCount}
            >
              Create rows
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="p-2 w-14">Idx</th>
              <th className="p-2">Sales Invoice</th>
              <th className="p-2 w-28 text-right">Cash</th>
              <th className="p-2 w-28 text-right">Card</th>
              <th className="p-2 w-28 text-right">KOKO</th>
              <th className="p-2 w-28 text-right">Bank</th>
              <th className="p-2 w-28 text-right">Row Total</th>
              <th className="p-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="text-muted-foreground p-6 text-center text-sm"
                >
                  No rows yet. Enter a row count above and click Create rows, or
                  use Add row.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
              const cash = toNum(row.cash);
              const card = toNum(row.card);
              const koko = toNum(row.koko);
              const bank = toNum(row.bankTransfer);
              const rowTotal = cash + card + koko + bank;
              const multi =
                [cash, card, koko, bank].filter((a) => a > 0).length > 1;
              return (
                <tr
                  key={row.key}
                  className={
                    multi
                      ? "border-b bg-amber-50/80 dark:bg-amber-950/20"
                      : "border-b"
                  }
                >
                  <td className="p-1">
                    <Input
                      value={row.idxNo}
                      disabled={isBusy || readOnly}
                      className="h-8 font-mono text-xs"
                      onChange={(e) => updateRow(row.key, { idxNo: e.target.value })}
                    />
                  </td>
                  <td className="relative p-1">
                    <Input
                      value={row.salesInvoice}
                      disabled={isBusy || readOnly}
                      placeholder="Type invoice no…"
                      className="h-8 font-mono text-xs"
                      onChange={(e) => {
                        updateRow(row.key, {
                          salesInvoice: e.target.value,
                          orderId: null,
                        });
                        fetchSuggestions(row.key, e.target.value);
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          setSuggestForKey((k) => (k === row.key ? null : k));
                        }, 150);
                      }}
                    />
                    {suggestForKey === row.key && suggestions.length > 0 && (
                      <ul className="bg-popover absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border shadow-md">
                        {suggestions.map((s) => (
                          <li key={s.orderId}>
                            <button
                              type="button"
                              className="hover:bg-accent w-full px-3 py-2 text-left text-xs"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => applySuggestion(row.key, s)}
                            >
                              <span className="font-mono font-medium">{s.label}</span>
                              <span className="text-muted-foreground ml-2">
                                {s.totalPrice.toFixed(2)} · {s.sourceName}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  {(
                    [
                      ["cash", row.cash],
                      ["card", row.card],
                      ["koko", row.koko],
                      ["bankTransfer", row.bankTransfer],
                    ] as const
                  ).map(([field, value]) => (
                    <td key={field} className="p-1">
                      <Input
                        inputMode="decimal"
                        value={value}
                        disabled={isBusy || readOnly}
                        className="h-8 text-right font-mono text-xs"
                        onChange={(e) =>
                          updateRow(row.key, { [field]: e.target.value })
                        }
                      />
                    </td>
                  ))}
                  <td className="p-2 text-right font-mono font-semibold">
                    {rowTotal.toFixed(2)}
                  </td>
                  <td className="p-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isBusy || readOnly}
                      onClick={() => removeRow(row.key)}
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
          <tfoot>
            <tr className="border-t text-xs">
              <td colSpan={2} className="p-2 text-muted-foreground">
                Column totals
              </td>
              <td className="p-2 text-right font-mono font-semibold">
                {totals.cash.toFixed(2)}
              </td>
              <td className="p-2 text-right font-mono font-semibold">
                {totals.card.toFixed(2)}
              </td>
              <td className="p-2 text-right font-mono font-semibold">
                {totals.koko.toFixed(2)}
              </td>
              <td className="p-2 text-right font-mono font-semibold">
                {totals.bank.toFixed(2)}
              </td>
              <td colSpan={2} />
            </tr>
            <tr>
              <td colSpan={6} className="p-2 text-right text-muted-foreground">
                Grand total
              </td>
              <td className="p-2 text-right font-mono text-base font-bold">
                {grand.toFixed(2)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={isBusy || readOnly}
          onClick={addRow}
        >
          <Plus className="h-4 w-4" />
          Add row
        </Button>
        <div className="flex max-w-full flex-1 flex-col items-end gap-2 sm:max-w-xl">
          {lastError ? (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive w-full rounded-md border px-3 py-2 text-left text-xs whitespace-pre-wrap break-words"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <span className="font-medium">Send failed — exact reason</span>
                <button
                  type="button"
                  className="text-destructive/70 hover:text-destructive shrink-0 underline"
                  onClick={clearError}
                >
                  Dismiss
                </button>
              </div>
              {lastError}
            </div>
          ) : (
            <span className="text-muted-foreground text-right text-sm break-words">
              {statusLine}
            </span>
          )}
          <Button
            type="button"
            disabled={isBusy || !companyLocationId}
            onClick={() => void handleSaveAndSendToErp()}
          >
            {busyKey === `erp:${postingDate}` ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                {readOnly ? "Sending..." : "Saving & sending..."}
              </>
            ) : (
              "Send to ERP"
            )}
          </Button>
        </div>
      </div>

      <div className="bg-card rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold tracking-wide uppercase text-muted-foreground">
          Save history
        </h2>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No saved book notes for this shop yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-2">Date</th>
                  <th className="p-2 text-right">Rows</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const active = item.posting_date === postingDate;
                  const resending = busyKey === `erp:${item.posting_date}`;
                  return (
                    <tr
                      key={item.id}
                      className={
                        active
                          ? "border-b bg-accent/40"
                          : "border-b hover:bg-muted/40"
                      }
                    >
                      <td className="p-2 font-mono">{item.posting_date}</td>
                      <td className="p-2 text-right font-mono">{item.rowCount}</td>
                      <td className="p-2 text-right font-mono">
                        {item.grandTotal.toFixed(2)}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {item.locked ? "Locked" : "Editable"}
                      </td>
                      <td className="p-2">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy || active}
                            onClick={() => openHistoryDay(item)}
                          >
                            Open
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isBusy || item.rowCount === 0 || !companyLocationId}
                            onClick={() => void handleResendHistoryToErp(item.posting_date)}
                          >
                            {resending ? (
                              <>
                                <Loader2 className="animate-spin" aria-hidden />
                                Sending...
                              </>
                            ) : (
                              "Resend to ERP"
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
