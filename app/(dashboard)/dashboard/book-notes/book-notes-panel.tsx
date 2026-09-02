"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";

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
  BookNoteReceiptDto,
  BookNoteSplitLine,
} from "@/lib/book-notes/types";
import {
  BOOK_NOTE_ERP_PAYMENT_METHODS,
  columnsToSplitLines,
  rowTotalFromSplitLines,
  type BookNoteErpPaymentMethod,
} from "@/lib/book-notes/split-lines";
import { notify } from "@/lib/notify";
import { LIMITS } from "@/lib/validation";

type SplitLineForm = {
  key: string;
  paymentMethod: BookNoteErpPaymentMethod;
  amount: string;
  cardLast4: string;
  kokoReference: string;
  bankReference: string;
};

type LedgerRow = {
  key: string;
  idxNo: string;
  salesInvoice: string;
  cash: string;
  card: string;
  cardReceiptRefLast4: string;
  koko: string;
  bankTransfer: string;
  splitMode: boolean;
  splitLines: SplitLineForm[];
  orderId: string | null;
};

const MAX_CREATE_ROWS = 200;

function toNum(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function emptySplitLine(paymentMethod: BookNoteErpPaymentMethod = "Card"): SplitLineForm {
  return {
    key: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    paymentMethod,
    amount: "",
    cardLast4: "",
    kokoReference: "",
    bankReference: "",
  };
}

function splitLineToForm(sl: BookNoteSplitLine): SplitLineForm {
  return {
    key: `sl-${sl.paymentMethod}-${Math.random().toString(36).slice(2, 7)}`,
    paymentMethod: sl.paymentMethod,
    amount: sl.amount ? String(sl.amount) : "",
    cardLast4: sl.cardLast4 ?? "",
    kokoReference: sl.kokoReference ?? "",
    bankReference: sl.bankReference ?? "",
  };
}

function splitLinesToPayload(lines: SplitLineForm[]): BookNoteSplitLine[] {
  return lines
    .map((sl) => ({
      paymentMethod: sl.paymentMethod,
      amount: toNum(sl.amount),
      cardLast4:
        sl.paymentMethod === "Card" && sl.cardLast4.trim()
          ? sl.cardLast4.trim()
          : null,
      kokoReference:
        sl.paymentMethod === "KOKO" && sl.kokoReference.trim()
          ? sl.kokoReference.trim()
          : null,
      bankReference:
        sl.paymentMethod === "Bank Transfer" && sl.bankReference.trim()
          ? sl.bankReference.trim()
          : null,
    }))
    .filter((sl) => sl.amount > 0);
}

function rowTotal(row: LedgerRow): number {
  if (row.splitMode) {
    return rowTotalFromSplitLines(splitLinesToPayload(row.splitLines));
  }
  return (
    toNum(row.cash) +
    toNum(row.card) +
    toNum(row.koko) +
    toNum(row.bankTransfer)
  );
}

function emptyRow(idx: number): LedgerRow {
  return {
    key: `r-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    idxNo: String(idx),
    salesInvoice: "",
    cash: "",
    card: "",
    cardReceiptRefLast4: "",
    koko: "",
    bankTransfer: "",
    splitMode: false,
    splitLines: [],
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
  return day.rows.map((r, i) => {
    const splitMode = Boolean(r.split_lines && r.split_lines.length > 0);
    return {
      key: `saved-${day.id}-${i}`,
      idxNo: r.idx_no || String(i + 1),
      salesInvoice: r.sales_invoice,
      cash: r.cash ? String(r.cash) : "",
      card: r.card ? String(r.card) : "",
      cardReceiptRefLast4: r.card_receipt_ref_last4 ?? "",
      koko: r.koko ? String(r.koko) : "",
      bankTransfer: r.bank_transfer ? String(r.bank_transfer) : "",
      splitMode,
      splitLines: splitMode
        ? r.split_lines!.map(splitLineToForm)
        : [],
      orderId: r.orderId ?? null,
    };
  });
}

type BookNotesPanelProps = {
  initialLocations: BookNoteLocationOption[];
  initialCanAccessAllShops?: boolean;
  initialCanBackdateBookNotes?: boolean;
  initialHistory?: BookNoteHistoryItem[];
  initialToday: string;
};

export function BookNotesPanel({
  initialLocations,
  initialCanAccessAllShops = false,
  initialCanBackdateBookNotes = false,
  initialHistory = [],
  initialToday,
}: BookNotesPanelProps) {
  const [locations] = useState(initialLocations);
  const [canAccessAllShops] = useState(initialCanAccessAllShops);
  const [canBackdateBookNotes] = useState(initialCanBackdateBookNotes);
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
  const [history, setHistory] = useState<BookNoteHistoryItem[]>(initialHistory);
  const [receipts, setReceipts] = useState<BookNoteReceiptDto[]>([]);
  const [suggestForKey, setSuggestForKey] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BookNoteOrderSuggestion[]>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);

  const isBusy = busyKey !== null;

  function isPostingDateWritable(date: string): boolean {
    if (!date || date > today) return false;
    if (date === today) return true;
    return canBackdateBookNotes;
  }

  const readOnly = locked || !isPostingDateWritable(postingDate);

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
      setReceipts(day?.receipts ?? []);
      setLocked(Boolean(day?.locked));
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
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if ("card" in patch && toNum(next.card) === 0) {
          next.cardReceiptRefLast4 = "";
        }
        return next;
      }),
    );
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

  function toggleSplitMode(key: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        if (r.splitMode) {
          const payload = splitLinesToPayload(r.splitLines);
          const cash = payload
            .filter((sl) => sl.paymentMethod === "Cash")
            .reduce((s, sl) => s + sl.amount, 0);
          const card = payload
            .filter((sl) => sl.paymentMethod === "Card")
            .reduce((s, sl) => s + sl.amount, 0);
          const koko = payload
            .filter((sl) => sl.paymentMethod === "KOKO")
            .reduce((s, sl) => s + sl.amount, 0);
          const bank = payload
            .filter((sl) => sl.paymentMethod === "Bank Transfer")
            .reduce((s, sl) => s + sl.amount, 0);
          const cardLines = payload.filter((sl) => sl.paymentMethod === "Card");
          return {
            ...r,
            splitMode: false,
            splitLines: [],
            cash: cash ? String(cash) : "",
            card: card ? String(card) : "",
            koko: koko ? String(koko) : "",
            bankTransfer: bank ? String(bank) : "",
            cardReceiptRefLast4:
              cardLines.length === 1 && cardLines[0]?.cardLast4
                ? cardLines[0].cardLast4
                : "",
          };
        }
        const fromColumns = columnsToSplitLines({
          cash: r.cash,
          card: r.card,
          cardReceiptRefLast4: r.cardReceiptRefLast4,
          koko: r.koko,
          bankTransfer: r.bankTransfer,
        });
        const splitLines =
          fromColumns.length > 0
            ? fromColumns.map(splitLineToForm)
            : [emptySplitLine("Card"), emptySplitLine("Cash")];
        return {
          ...r,
          splitMode: true,
          splitLines,
          cash: "",
          card: "",
          cardReceiptRefLast4: "",
          koko: "",
          bankTransfer: "",
        };
      }),
    );
  }

  function updateSplitLine(
    rowKey: string,
    lineKey: string,
    patch: Partial<SplitLineForm>,
  ) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== rowKey) return r;
        return {
          ...r,
          splitLines: r.splitLines.map((sl) => {
            if (sl.key !== lineKey) return sl;
            const next = { ...sl, ...patch };
            if ("paymentMethod" in patch && patch.paymentMethod !== "Card") {
              next.cardLast4 = "";
            }
            if ("paymentMethod" in patch && patch.paymentMethod !== "KOKO") {
              next.kokoReference = "";
            }
            if (
              "paymentMethod" in patch &&
              patch.paymentMethod !== "Bank Transfer"
            ) {
              next.bankReference = "";
            }
            return next;
          }),
        };
      }),
    );
  }

  function addSplitLine(rowKey: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== rowKey) return r;
        return { ...r, splitLines: [...r.splitLines, emptySplitLine()] };
      }),
    );
  }

  function removeSplitLine(rowKey: string, lineKey: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== rowKey) return r;
        const next = r.splitLines.filter((sl) => sl.key !== lineKey);
        return {
          ...r,
          splitLines: next.length > 0 ? next : [emptySplitLine()],
        };
      }),
    );
  }

  function openHistoryDay(item: BookNoteHistoryItem) {
    setCompanyLocationId(item.companyLocationId);
    setPostingDate(item.posting_date);
    setLocked(item.locked);
    clearError();
    void loadDay(item.companyLocationId, item.posting_date);
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
    for (const r of rows) {
      if (r.splitMode) {
        const payload = splitLinesToPayload(r.splitLines);
        if (payload.length === 0) {
          showError(
            `Row ${r.idxNo || "?"}: add at least one split payment line with amount`,
          );
          return null;
        }
        for (let i = 0; i < r.splitLines.length; i++) {
          const sl = r.splitLines[i]!;
          const amt = toNum(sl.amount);
          if (amt <= 0) continue;
          if (
            sl.paymentMethod === "Card" &&
            sl.cardLast4.trim() &&
            !/^\d{4}$/.test(sl.cardLast4.trim())
          ) {
            showError(
              `Row ${r.idxNo || "?"} split line ${i + 1}: card last 4 must be exactly 4 digits`,
            );
            return null;
          }
        }
        continue;
      }
      const cardAmt = toNum(r.card);
      const ref = r.cardReceiptRefLast4.trim();
      if (cardAmt > 0 && !/^\d{4}$/.test(ref)) {
        showError(
          `Row ${r.idxNo || "?"}: enter last 4 digits of card receipt reference when card amount is entered`,
        );
        return null;
      }
    }

    const payload = {
      companyLocationId,
      postingDate,
      rows: rows.map((r) => {
        const splitLines = r.splitMode ? splitLinesToPayload(r.splitLines) : null;
        return {
          idxNo: r.idxNo,
          salesInvoice: r.salesInvoice.trim(),
          cash: r.splitMode ? 0 : toNum(r.cash),
          card: r.splitMode ? 0 : toNum(r.card),
          cardReceiptRefLast4:
            !r.splitMode && toNum(r.card) > 0
              ? r.cardReceiptRefLast4.trim() || null
              : null,
          koko: r.splitMode ? 0 : toNum(r.koko),
          bankTransfer: r.splitMode ? 0 : toNum(r.bankTransfer),
          splitLines,
          orderId: r.orderId,
        };
      }),
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
    setReceipts(day.receipts ?? []);
    setLocked(day.locked);
    await refreshHistory();
    return day;
  }

  async function uploadReceiptFiles(fileList: FileList | null) {
    if (!fileList?.length || !companyLocationId || readOnly) return;
    const files = Array.from(fileList);
    const remaining = LIMITS.bookNoteReceiptsMax - receipts.length;
    if (remaining <= 0) {
      notify.error(`Maximum ${LIMITS.bookNoteReceiptsMax} receipt images per day`);
      return;
    }
    const toUpload = files.slice(0, remaining);
    if (files.length > remaining) {
      notify.error(`Only ${remaining} more image(s) allowed for this day`);
    }

    setBusyKey("receipt-upload");
    clearError();
    try {
      for (const file of toUpload) {
        const body = new FormData();
        body.append("file", file);
        body.append("companyLocationId", companyLocationId);
        body.append("postingDate", postingDate);
        const res = await fetch("/api/admin/book-notes/receipts", {
          method: "POST",
          body,
        });
        const data = await res.json();
        if (!res.ok) {
          showError(data.error ?? "Receipt upload failed");
          return;
        }
        if (data.day) {
          const day = data.day as BookNoteDayDto;
          setReceipts(day.receipts ?? []);
          setStatusLine(`Receipts: ${(day.receipts ?? []).length} image(s)`);
        } else if (data.receipt) {
          setReceipts((prev) => {
            const next = [...prev, data.receipt as BookNoteReceiptDto];
            setStatusLine(`Receipts: ${next.length} image(s)`);
            return next;
          });
        }
      }
      notify.success(
        toUpload.length === 1
          ? "Receipt image added"
          : `Added ${toUpload.length} receipt images`,
      );
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Receipt upload failed",
      );
    } finally {
      setBusyKey(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
    }
  }

  async function removeReceipt(receiptId: string) {
    if (readOnly) return;
    setBusyKey(`receipt-del:${receiptId}`);
    clearError();
    try {
      const res = await fetch(`/api/admin/book-notes/receipts/${receiptId}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(
          typeof data.error === "string" ? data.error : "Failed to remove receipt",
        );
        return;
      }
      setReceipts((prev) => prev.filter((r) => r.id !== receiptId));
      notify.success("Receipt removed");
    } catch (err) {
      showError(
        err instanceof Error ? err.message : "Failed to remove receipt",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function sendDayToErp(
    dateYmd: string,
    locationId: string = companyLocationId,
  ): Promise<boolean> {
    const res = await fetch("/api/admin/book-notes/send-to-erp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyLocationId: locationId,
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
    const receiptUpload = data.receiptUpload as {
      uploaded?: number;
      failed?: number;
      receiptCount?: number;
      bookNoteCount?: number;
      errors?: string[];
    } | null;
    let line = s
      ? `ERP ${dateYmd}: ${s.verified_count ?? 0} verified, ${s.mismatch_count ?? 0} mismatch, ${s.not_found_count ?? 0} not found (of ${s.total_rows ?? 0})`
      : `Sent ${dateYmd} to ERP`;
    if (receiptUpload && (receiptUpload.receiptCount ?? 0) > 0) {
      line += ` · receipts ${receiptUpload.uploaded ?? 0} uploaded`;
      if ((receiptUpload.failed ?? 0) > 0) {
        line += `, ${receiptUpload.failed} failed`;
        const firstErr = receiptUpload.errors?.[0];
        if (firstErr) line += ` (${firstErr})`;
      }
    }
    setStatusLine(line);
    notify.success(line);
    return true;
  }

  /** Save then push to ERP (today or a history day). */
  async function handleSaveAndSendToErp() {
    if (!companyLocationId) return;
    if (readOnly) {
      showError(
        canBackdateBookNotes
          ? "This sales date is locked (future dates cannot be saved)."
          : "Past dates are locked. Only today can be edited unless you have book notes admin permission.",
      );
      return;
    }

    const filled = rows.some(
      (r) => r.salesInvoice.trim() || rowTotal(r) > 0,
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
  async function handleResendHistoryToErp(item: BookNoteHistoryItem) {
    if (!item.companyLocationId || !item.posting_date) return;
    setBusyKey(`erp:${item.companyLocationId}:${item.posting_date}`);
    clearError();
    setStatusLine(`Sending ${item.shopName} ${item.posting_date} to ERP...`);
    try {
      await sendDayToErp(item.posting_date, item.companyLocationId);
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
      if (r.splitMode) {
        for (const sl of splitLinesToPayload(r.splitLines)) {
          switch (sl.paymentMethod) {
            case "Cash":
              acc.cash += sl.amount;
              break;
            case "Card":
              acc.card += sl.amount;
              break;
            case "KOKO":
              acc.koko += sl.amount;
              break;
            case "Bank Transfer":
              acc.bank += sl.amount;
              break;
            default:
              break;
          }
        }
      } else {
        acc.cash += toNum(r.cash);
        acc.card += toNum(r.card);
        acc.koko += toNum(r.koko);
        acc.bank += toNum(r.bankTransfer);
      }
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
          book. Use <span className="font-semibold text-violet-700">SPLIT</span>{" "}
          when one invoice has multiple payment legs (e.g. two cards with
          different receipt refs). When a normal row includes card payment,
          enter the last 4 digits of the POS receipt reference. Merchants enter
          today&apos;s date only; users with book notes admin permission can
          pick older dates to upload or edit. History is shop-scoped
          {canAccessAllShops
            ? " — admins see all shops"
            : " — you only see your assigned shop(s)"}
          .
        </p>
      </div>

      {locations.length === 0 ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
          No shop assigned to your account. Ask an admin to set your employee
          location (or default merchant) before entering book notes.
        </div>
      ) : null}

      <div className="bg-card grid gap-4 rounded-lg border p-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Shop</label>
          <Select
            value={companyLocationId}
            disabled={isBusy}
            onValueChange={(id) => {
              setCompanyLocationId(id);
              setPostingDate(today);
              setLocked(false);
              clearError();
              void loadDay(id, today);
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
          {canBackdateBookNotes ? (
            <Input
              type="date"
              value={postingDate}
              max={today}
              disabled={isBusy}
              className="font-medium tabular-nums"
              onChange={(e) => {
                const next = e.target.value;
                if (!next || next > today) return;
                setPostingDate(next);
                setLocked(false);
                clearError();
                void loadDay(companyLocationId, next);
              }}
            />
          ) : (
            <div className="bg-muted/40 flex h-9 items-center rounded-md border px-3 text-sm font-medium tabular-nums">
              {postingDate}
              {postingDate === today ? (
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  (today)
                </span>
              ) : null}
            </div>
          )}
          {canBackdateBookNotes && postingDate !== today ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-xs">
                Admin backdate — save &amp; send updates this date.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => {
                  setPostingDate(today);
                  setLocked(false);
                  clearError();
                  void loadDay(companyLocationId, today);
                }}
              >
                Back to today
              </Button>
            </div>
          ) : null}
          {!canBackdateBookNotes && postingDate !== today ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-muted-foreground text-xs">
                View-only history day — open today to enter or edit.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => {
                  setPostingDate(today);
                  setLocked(false);
                  clearError();
                  void loadDay(companyLocationId, today);
                }}
              >
                Back to today
              </Button>
            </div>
          ) : null}
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
              <th className="p-2 w-32 text-right">Card</th>
              <th className="p-2 w-28 text-right">KOKO</th>
              <th className="p-2 w-28 text-right">Bank</th>
              <th className="p-2 w-28 text-right">Row Total</th>
              <th className="p-2 w-20 text-center">Split</th>
              <th className="p-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
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
              const rowTotalAmt = rowTotal(row);
              const multi =
                row.splitMode ||
                [cash, card, koko, bank].filter((a) => a > 0).length > 1;
              return (
                <Fragment key={row.key}>
                <tr
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
                  <td className="p-1">
                    <Input
                      inputMode="decimal"
                      value={row.cash}
                      disabled={isBusy || readOnly || row.splitMode}
                      className="h-8 text-right font-mono text-xs"
                      onChange={(e) =>
                        updateRow(row.key, { cash: e.target.value })
                      }
                    />
                  </td>
                  <td className="p-1 align-top">
                    <Input
                      inputMode="decimal"
                      value={row.card}
                      disabled={isBusy || readOnly || row.splitMode}
                      className="h-8 text-right font-mono text-xs"
                      onChange={(e) =>
                        updateRow(row.key, { card: e.target.value })
                      }
                    />
                    {card > 0 && !row.splitMode ? (
                      <Input
                        inputMode="numeric"
                        maxLength={4}
                        value={row.cardReceiptRefLast4}
                        disabled={isBusy || readOnly}
                        placeholder="Last 4 ref"
                        aria-label="Card receipt reference last 4 digits"
                        className="mt-1 h-7 text-center font-mono text-xs tracking-widest"
                        onChange={(e) =>
                          updateRow(row.key, {
                            cardReceiptRefLast4: e.target.value
                              .replace(/\D/g, "")
                              .slice(0, 4),
                          })
                        }
                      />
                    ) : null}
                  </td>
                  {(
                    [
                      ["koko", row.koko],
                      ["bankTransfer", row.bankTransfer],
                    ] as const
                  ).map(([field, value]) => (
                    <td key={field} className="p-1">
                      <Input
                        inputMode="decimal"
                        value={value}
                        disabled={isBusy || readOnly || row.splitMode}
                        className="h-8 text-right font-mono text-xs"
                        onChange={(e) =>
                          updateRow(row.key, { [field]: e.target.value })
                        }
                      />
                    </td>
                  ))}
                  <td className="p-2 text-right font-mono font-semibold">
                    {rowTotalAmt.toFixed(2)}
                  </td>
                  <td className="p-1 text-center">
                    <Button
                      type="button"
                      variant={row.splitMode ? "default" : "outline"}
                      size="sm"
                      disabled={isBusy || readOnly}
                      className={
                        row.splitMode
                          ? "h-7 bg-violet-600 px-2 text-[11px] font-bold tracking-wide hover:bg-violet-700"
                          : "h-7 px-2 text-[11px] font-bold tracking-wide"
                      }
                      onClick={() => toggleSplitMode(row.key)}
                    >
                      {row.splitMode ? "SPLIT" : "Split"}
                    </Button>
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
                {row.splitMode ? (
                  <tr key={`${row.key}-split`} className="border-b bg-violet-50/50 dark:bg-violet-950/20">
                    <td colSpan={9} className="p-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-300">
                            Split payment lines
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isBusy || readOnly}
                            onClick={() => addSplitLine(row.key)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add line
                          </Button>
                        </div>
                        <div className="overflow-x-auto rounded-md border bg-background">
                          <table className="w-full min-w-[640px] text-xs">
                            <thead>
                              <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                                <th className="p-2">Method</th>
                                <th className="p-2 w-28 text-right">Amount</th>
                                <th className="p-2 w-24">Card last 4</th>
                                <th className="p-2">KOKO ref</th>
                                <th className="p-2">Bank ref</th>
                                <th className="p-2 w-10" />
                              </tr>
                            </thead>
                            <tbody>
                              {row.splitLines.map((sl) => (
                                <tr key={sl.key} className="border-b last:border-0">
                                  <td className="p-1">
                                    <Select
                                      value={sl.paymentMethod}
                                      disabled={isBusy || readOnly}
                                      onValueChange={(v) =>
                                        updateSplitLine(row.key, sl.key, {
                                          paymentMethod: v as BookNoteErpPaymentMethod,
                                        })
                                      }
                                    >
                                      <SelectTrigger className="h-8 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {BOOK_NOTE_ERP_PAYMENT_METHODS.map((m) => (
                                          <SelectItem key={m} value={m}>
                                            {m}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                  <td className="p-1">
                                    <Input
                                      inputMode="decimal"
                                      value={sl.amount}
                                      disabled={isBusy || readOnly}
                                      className="h-8 text-right font-mono"
                                      onChange={(e) =>
                                        updateSplitLine(row.key, sl.key, {
                                          amount: e.target.value,
                                        })
                                      }
                                    />
                                  </td>
                                  <td className="p-1">
                                    {sl.paymentMethod === "Card" ? (
                                      <Input
                                        inputMode="numeric"
                                        maxLength={4}
                                        value={sl.cardLast4}
                                        disabled={isBusy || readOnly}
                                        placeholder="1234"
                                        className="h-8 text-center font-mono tracking-widest"
                                        onChange={(e) =>
                                          updateSplitLine(row.key, sl.key, {
                                            cardLast4: e.target.value
                                              .replace(/\D/g, "")
                                              .slice(0, 4),
                                          })
                                        }
                                      />
                                    ) : (
                                      <span className="text-muted-foreground px-2">—</span>
                                    )}
                                  </td>
                                  <td className="p-1">
                                    {sl.paymentMethod === "KOKO" ? (
                                      <Input
                                        value={sl.kokoReference}
                                        disabled={isBusy || readOnly}
                                        placeholder="KOKO order ref"
                                        className="h-8"
                                        onChange={(e) =>
                                          updateSplitLine(row.key, sl.key, {
                                            kokoReference: e.target.value,
                                          })
                                        }
                                      />
                                    ) : (
                                      <span className="text-muted-foreground px-2">—</span>
                                    )}
                                  </td>
                                  <td className="p-1">
                                    {sl.paymentMethod === "Bank Transfer" ? (
                                      <Input
                                        value={sl.bankReference}
                                        disabled={isBusy || readOnly}
                                        placeholder="Bank ref"
                                        className="h-8"
                                        onChange={(e) =>
                                          updateSplitLine(row.key, sl.key, {
                                            bankReference: e.target.value,
                                          })
                                        }
                                      />
                                    ) : (
                                      <span className="text-muted-foreground px-2">—</span>
                                    )}
                                  </td>
                                  <td className="p-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={isBusy || readOnly}
                                      onClick={() => removeSplitLine(row.key, sl.key)}
                                      aria-label="Remove split line"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
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
              <td colSpan={3} />
            </tr>
            <tr>
              <td colSpan={6} className="p-2 text-right text-muted-foreground">
                Grand total
              </td>
              <td className="p-2 text-right font-mono text-base font-bold">
                {grand.toFixed(2)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="bg-card space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
              Day receipts
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">
              One photo set for this whole day (card/KOKO slips, etc.). Sent to
              ERP with the ledger so finance can open them from bank recon INFO.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="sr-only"
              disabled={isBusy || readOnly || !companyLocationId}
              onChange={(e) => void uploadReceiptFiles(e.target.files)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                isBusy ||
                readOnly ||
                !companyLocationId ||
                receipts.length >= LIMITS.bookNoteReceiptsMax
              }
              onClick={() => receiptInputRef.current?.click()}
            >
              {busyKey === "receipt-upload" ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Uploading...
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" />
                  Add photos
                </>
              )}
            </Button>
          </div>
        </div>
        {receipts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No receipt photos yet
            {readOnly ? "." : " — add images before Send to ERP."}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {receipts.map((r) => (
              <li
                key={r.id}
                className="bg-muted/30 relative overflow-hidden rounded-md border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.url}
                  alt={r.fileName}
                  className="h-28 w-full object-cover"
                />
                <div className="flex items-center justify-between gap-1 px-2 py-1">
                  <span className="truncate text-[11px] text-muted-foreground">
                    {r.fileName}
                  </span>
                  {!readOnly ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      disabled={isBusy}
                      aria-label={`Remove ${r.fileName}`}
                      onClick={() => void removeReceipt(r.id)}
                    >
                      {busyKey === `receipt-del:${r.id}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted-foreground text-[11px]">
          {receipts.length}/{LIMITS.bookNoteReceiptsMax} images · JPEG/PNG/WebP/GIF
          · max {Math.round(LIMITS.bookNoteReceiptMaxBytes / (1024 * 1024))}MB each
        </p>
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
          {canAccessAllShops ? " (all shops)" : ""}
        </h2>
        {locations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No shop assigned to your account. Ask an admin to set your employee
            location.
          </p>
        ) : history.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No saved book notes for{" "}
            {canAccessAllShops ? "any shop" : "this shop"} yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-2">Shop</th>
                  <th className="p-2">Date</th>
                  <th className="p-2 text-right">Rows</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const active =
                    item.posting_date === postingDate &&
                    item.companyLocationId === companyLocationId;
                  const resending =
                    busyKey ===
                    `erp:${item.companyLocationId}:${item.posting_date}`;
                  return (
                    <tr
                      key={item.id}
                      className={
                        active
                          ? "border-b bg-accent/40"
                          : "border-b hover:bg-muted/40"
                      }
                    >
                      <td className="p-2 font-medium">{item.shopName}</td>
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
                            disabled={isBusy || item.rowCount === 0}
                            onClick={() => void handleResendHistoryToErp(item)}
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
