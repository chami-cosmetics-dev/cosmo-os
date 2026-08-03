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
  BookNoteLocationOption,
  BookNoteOrderSuggestion,
} from "@/lib/book-notes/types";
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

function dayToRows(day: BookNoteDayDto | null): LedgerRow[] {
  if (!day?.rows?.length) {
    return [1, 2, 3, 4].map((i) => emptyRow(i));
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
  const [rows, setRows] = useState<LedgerRow[]>(() =>
    [1, 2, 3, 4].map((i) => emptyRow(i)),
  );
  const [locked, setLocked] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [statusLine, setStatusLine] = useState("");
  const [suggestForKey, setSuggestForKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BookNoteOrderSuggestion[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydrated = useRef(false);

  const isBusy = busyKey !== null;
  const readOnly = locked || postingDate !== today;

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
      setRows(dayToRows(day));
      setLocked(Boolean(day?.locked) || date !== (data.today as string));
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

  function addRow() {
    setRows((prev) => [...prev, emptyRow(prev.length + 1)]);
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
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

  async function handleSave() {
    if (readOnly || !companyLocationId) return;
    setBusyKey("save");
    setStatusLine("Saving...");
    try {
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
        const msg = data.error ?? "Save failed";
        notify.error(msg);
        setStatusLine(data.code === "DAY_LOCKED" ? "Day locked" : msg);
        if (data.code === "DAY_LOCKED") setLocked(true);
        return;
      }
      const day = data as BookNoteDayDto;
      setRows(dayToRows(day));
      setLocked(day.locked);
      setStatusLine(`Saved ${day.rows.length} row(s)`);
      notify.success("Book note saved");
    } catch {
      notify.error("Save failed");
      setStatusLine("Save failed");
    } finally {
      setBusyKey(null);
    }
  }

  function handleExport() {
    const location = locations.find((l) => l.id === companyLocationId);
    const company = location?.erpnextCompany?.trim() || location?.name || "";
    const payload = {
      company,
      posting_date: postingDate,
      rows: rows
        .map((r) => ({
          idx_no: r.idxNo,
          sales_invoice: r.salesInvoice.trim(),
          cash: toNum(r.cash),
          card: toNum(r.card),
          koko: toNum(r.koko),
          bank_transfer: toNum(r.bankTransfer),
        }))
        .filter(
          (r) =>
            r.sales_invoice ||
            r.cash + r.card + r.koko + r.bank_transfer > 0,
        ),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `book_note_${postingDate || "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
          Enter today&apos;s outlet invoices and payment splits as recorded in the
          physical book. Matching against ERP happens later on the finance side.
        </p>
      </div>

      <div className="bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Outlet</label>
          <Select
            value={companyLocationId}
            disabled={isBusy}
            onValueChange={(id) => {
              setCompanyLocationId(id);
              void loadDay(id, postingDate);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select outlet" />
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
              setLocked(next !== today);
              void loadDay(companyLocationId, next);
            }}
          />
          {readOnly && (
            <p className="text-amber-700 dark:text-amber-400 text-xs">
              This day is read-only. Merchants can only save today&apos;s book note
              ({today}).
            </p>
          )}
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
            {rows.map((row) => {
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
                        // delay so click on suggestion registers
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
                      disabled={isBusy || readOnly || rows.length <= 1}
                      onClick={() => removeRow(row.key)}
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
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
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isBusy || readOnly}
            onClick={addRow}
          >
            <Plus className="h-4 w-4" />
            Add row
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy}
            onClick={handleExport}
          >
            Export JSON
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">{statusLine}</span>
          <Button
            type="button"
            disabled={isBusy || readOnly || !companyLocationId}
            onClick={() => void handleSave()}
          >
            {busyKey === "save" ? (
              <>
                <Loader2 className="animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
