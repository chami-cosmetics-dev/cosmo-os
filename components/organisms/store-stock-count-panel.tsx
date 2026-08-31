"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import {
  companyLabel,
  toCompanyKey,
} from "@/lib/store-stock-count/company-key";
import { difference } from "@/lib/store-stock-count/difference";
import type {
  SelectableErpCompany,
  SelectableErpWarehouse,
  StoreStockCountReportListItem,
  StoreStockCountSavedItem,
  StoreStockCountSavedReport,
} from "@/lib/store-stock-count/types";

const ROW_H = 44;
const OVERSCAN = 16;
const VIEWPORT_H = 520;
const SCAN_KEY_INTERVAL_MS = 35;
const MIN_SCAN_LENGTH = 4;
const SCAN_BATCH_SIZE = 10;
const SCAN_BATCH_DELAY_MS = 120;

type CountFilter = "all" | "counted" | "uncounted";
type NumberOp = "" | "lt" | "gt" | "eq";
type ScanStatus = "processing" | "done" | "difference" | "errored";
type ScanJob = {
  id: string;
  reportId: string | null;
  barcode: string;
  status: ScanStatus;
  message: string;
  sku?: string;
  itemId?: string;
  totalCount?: number | null;
  manualCount?: number | null;
  diff?: number | null;
  qbStock?: number | null;
};
type AutoSaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

function parseCountInput(raw: string, previous: number | null): number | null {
  const t = raw.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return previous;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return previous;
  return n;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-LK", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function numberMatches(value: number | null, op: NumberOp, rawTarget: string) {
  if (!op) return true;
  const target = Number(rawTarget);
  if (!Number.isFinite(target)) return true;
  if (value == null) return false;
  if (op === "lt") return value < target;
  if (op === "gt") return value > target;
  return value === target;
}

function countValue(
  item: StoreStockCountSavedItem,
  drafts: Record<string, number | null>,
) {
  return Object.prototype.hasOwnProperty.call(drafts, item.id)
    ? (drafts[item.id] ?? null)
    : item.manualCount;
}

function hasExactBarcodeMatch(code: string, rows: StoreStockCountSavedItem[]) {
  const trimmed = code.trim();
  if (trimmed.length < MIN_SCAN_LENGTH) return false;
  let hits = 0;
  for (const row of rows) {
    if (row.barcodes.some((barcode) => barcode.trim() === trimmed)) hits += 1;
    if (hits > 1) return false;
  }
  return hits === 1;
}

function upsertScanJob(jobs: ScanJob[], job: ScanJob) {
  return [job, ...jobs.filter((existing) => existing.id !== job.id)].slice(
    0,
    50,
  );
}

function scanCountMessage(diff: number | null, count: number) {
  return diff === 0
    ? `Done - count ${count}`
    : `Difference ${diff == null ? "-" : diff > 0 ? `+${diff}` : diff} - count ${count}`;
}

function ScanStatusCard({
  title,
  jobs,
  empty,
  tone,
  onSelectItem,
  showQbStock = false,
}: {
  title: string;
  jobs: ScanJob[];
  empty: string;
  tone: "muted" | "success" | "warning";
  onSelectItem?: (itemId: string) => void;
  showQbStock?: boolean;
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";

  const gridColumns = showQbStock
    ? "minmax(7rem,1fr) 4rem 4rem 4rem 5rem"
    : "minmax(7rem,1fr) 4rem 4rem 5rem";

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="text-xs text-muted-foreground">{jobs.length}</span>
      </div>
      <div
        className="grid gap-2 border-b pb-2 text-xs font-medium text-muted-foreground"
        style={{ gridTemplateColumns: gridColumns }}
      >
        <span>Item</span>
        <span className="text-right">Total</span>
        {showQbStock ? <span className="text-right">QB Stock</span> : null}
        <span className="text-right">Count</span>
        <span className="text-right">Diff</span>
      </div>
      <div className="max-h-72 min-h-64 overflow-y-auto text-sm">
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            className="grid w-full gap-2 border-b py-2 text-left last:border-b-0 hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
            style={{ gridTemplateColumns: gridColumns }}
            disabled={!job.itemId || !onSelectItem}
            onClick={() => {
              if (job.itemId) onSelectItem?.(job.itemId);
            }}
          >
            <span className="truncate font-medium">
              {job.sku ?? job.barcode}
            </span>
            {job.status === "errored" ? (
              <span
                className={
                  showQbStock
                    ? "col-span-4 truncate text-xs text-destructive"
                    : "col-span-3 truncate text-xs text-destructive"
                }
              >
                {job.message}
              </span>
            ) : (
              <>
                <span className={`text-right tabular-nums ${toneClass}`}>
                  {job.totalCount ?? "-"}
                </span>
                {showQbStock ? (
                  <span className={`text-right tabular-nums ${toneClass}`}>
                    {job.qbStock ?? "-"}
                  </span>
                ) : null}
                <span className={`text-right tabular-nums ${toneClass}`}>
                  {job.manualCount ?? "-"}
                </span>
                <span className={`text-right tabular-nums ${toneClass}`}>
                  {job.diff == null
                    ? "-"
                    : job.diff > 0
                      ? `+${job.diff}`
                      : job.diff}
                </span>
              </>
            )}
          </button>
        ))}
        {jobs.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{empty}</p>
        ) : null}
      </div>
    </div>
  );
}
export function StoreStockCountPanel({
  initialReportId,
  standalone = false,
}: { initialReportId?: string; standalone?: boolean } = {}) {
  const [companies, setCompanies] = useState<SelectableErpCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [expandedCompanyKeys, setExpandedCompanyKeys] = useState<Set<string>>(
    new Set(),
  );
  const [warehousesByCompany, setWarehousesByCompany] = useState<
    Record<string, SelectableErpWarehouse[]>
  >({});
  const [warehouseLoadingKeys, setWarehouseLoadingKeys] = useState<Set<string>>(
    new Set(),
  );
  const [selectedWarehouseKeys, setSelectedWarehouseKeys] = useState<
    Set<string>
  >(new Set());
  const [visibleWarehouseKeys, setVisibleWarehouseKeys] = useState<Set<string>>(
    new Set(),
  );
  const [reports, setReports] = useState<StoreStockCountReportListItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [activeReport, setActiveReport] =
    useState<StoreStockCountSavedReport | null>(null);
  const [selectedCardItemId, setSelectedCardItemId] = useState<string | null>(
    null,
  );
  const [qbImportBusy, setQbImportBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanQueue, setScanQueue] = useState<ScanJob[]>([]);
  const [highlightedSku, setHighlightedSku] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({});
  const [draftCounts, setDraftCounts] = useState<Record<string, number | null>>(
    {},
  );
  const [title, setTitle] = useState(
    `Stock count ${new Date().toLocaleDateString("en-CA")}`,
  );
  const [query, setQuery] = useState("");
  const [scanCardQuery, setScanCardQuery] = useState("");
  const [countFilter, setCountFilter] = useState<CountFilter>("all");
  const [stockOp, setStockOp] = useState<NumberOp>("");
  const [stockTarget, setStockTarget] = useState("");
  const [manualOp, setManualOp] = useState<NumberOp>("");
  const [manualTarget, setManualTarget] = useState("");
  const [diffOp, setDiffOp] = useState<NumberOp>("");
  const [diffTarget, setDiffTarget] = useState("");
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [reportDateFrom, setReportDateFrom] = useState("");
  const [reportDateTo, setReportDateTo] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const qbImportInputRef = useRef<HTMLInputElement>(null);
  const countFocusedRef = useRef(false);
  const lastScanKeyAtRef = useRef(0);
  const scanBufferRef = useRef("");
  const activeReportRef = useRef<StoreStockCountSavedReport | null>(null);
  const draftCountsRef = useRef<Record<string, number | null>>({});
  const dirtyCountsRef = useRef<Record<string, number | null>>({});
  const autoSaveInFlightRef = useRef(false);
  const autoSaveTimerRef = useRef<number | null>(null);
  const pendingScansRef = useRef<string[]>([]);
  const drainScheduledRef = useRef(false);
  const scanBatchTimerRef = useRef<number | null>(null);

  const warehouseByKey = useMemo(() => {
    const m = new Map<string, SelectableErpWarehouse>();
    for (const warehouses of Object.values(warehousesByCompany)) {
      for (const warehouse of warehouses) m.set(warehouse.key, warehouse);
    }
    return m;
  }, [warehousesByCompany]);

  const selectedWarehouses = useMemo(
    () =>
      [...selectedWarehouseKeys]
        .map((key) => warehouseByKey.get(key))
        .filter((w): w is SelectableErpWarehouse => w != null),
    [selectedWarehouseKeys, warehouseByKey],
  );

  const selectedCompanies = useMemo(() => {
    const m = new Map<string, SelectableErpCompany>();
    for (const warehouse of selectedWarehouses) {
      const key = `${warehouse.instanceId}::${warehouse.erpCompany}`;
      if (!m.has(key)) {
        m.set(key, {
          instanceId: warehouse.instanceId,
          instanceLabel: warehouse.instanceLabel,
          erpCompany: warehouse.erpCompany,
        });
      }
    }
    return [...m.values()];
  }, [selectedWarehouses]);

  const isLocked = activeReport?.status === "submitted";

  const visibleWarehouses =
    activeReport?.warehouses.filter((w) => visibleWarehouseKeys.has(w.key)) ??
    [];
  const visibleLoadedKeys = visibleWarehouses.map((w) => w.key);
  const hasQbStock =
    activeReport?.items.some((item) => item.qbStock != null) ?? false;
  const warehouseGridColumns = visibleLoadedKeys
    .map(() => "minmax(7.5rem,1fr)")
    .join(" ");
  const qbStockGridColumn = hasQbStock ? " 6rem" : "";
  const tableGridColumns = `minmax(6.5rem,0.65fr) minmax(10rem,1.15fr) minmax(7rem,0.7fr) ${warehouseGridColumns} 6.5rem${qbStockGridColumn} 6.5rem 4.5rem`;
  const filteredReports = useMemo(() => {
    const fromTime = reportDateFrom
      ? new Date(`${reportDateFrom}T00:00:00`).getTime()
      : null;
    const toTime = reportDateTo
      ? new Date(`${reportDateTo}T23:59:59.999`).getTime()
      : null;
    return reports.filter((report) => {
      const t = new Date(report.updatedAt).getTime();
      if (fromTime != null && t < fromTime) return false;
      if (toTime != null && t > toTime) return false;
      return true;
    });
  }, [reportDateFrom, reportDateTo, reports]);

  const filteredRows = useMemo(() => {
    if (!activeReport) return [];
    const q = query.trim().toLowerCase();
    return activeReport.items.filter((row) => {
      if (row.manualCount != null) return false;
      const manualCount = countValue(row, draftCounts);
      const diff = difference(manualCount, row.stockSum);
      if (q) {
        const haystack = [row.sku, row.name, row.description, ...row.barcodes]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (countFilter === "counted" && manualCount == null) return false;
      if (countFilter === "uncounted" && manualCount != null) return false;
      if (!numberMatches(row.stockSum, stockOp, stockTarget)) return false;
      if (!numberMatches(manualCount, manualOp, manualTarget)) return false;
      if (!numberMatches(diff, diffOp, diffTarget)) return false;
      return true;
    });
  }, [
    activeReport,
    countFilter,
    diffOp,
    diffTarget,
    draftCounts,
    manualOp,
    manualTarget,
    query,
    stockOp,
    stockTarget,
  ]);

  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleEnd = Math.min(
    filteredRows.length,
    Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN,
  );
  const visibleRows = filteredRows.slice(visibleStart, visibleEnd);
  const padTop = visibleStart * ROW_H;
  const padBottom = Math.max(0, (filteredRows.length - visibleEnd) * ROW_H);

  const resetScanState = useCallback(() => {
    pendingScansRef.current = [];
    drainScheduledRef.current = false;
    if (scanBatchTimerRef.current != null) {
      window.clearTimeout(scanBatchTimerRef.current);
      scanBatchTimerRef.current = null;
    }
    setScanQueue([]);
  }, []);

  const resetDraftState = useCallback(() => {
    draftCountsRef.current = {};
    dirtyCountsRef.current = {};
    autoSaveInFlightRef.current = false;
    if (autoSaveTimerRef.current != null) {
      window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setAutoSaveStatus("idle");
    setDraftCounts({});
  }, []);

  const flushAutoSave = useCallback(async () => {
    const report = activeReportRef.current;
    if (!report || report.status === "submitted") return true;
    if (autoSaveInFlightRef.current) return false;

    const items = Object.entries(dirtyCountsRef.current).map(
      ([itemId, manualCount]) => ({ itemId, manualCount }),
    );
    if (items.length === 0) {
      setAutoSaveStatus("saved");
      return true;
    }

    dirtyCountsRef.current = {};
    autoSaveInFlightRef.current = true;
    setAutoSaveStatus("saving");
    let nextFlushDelay = 150;
    try {
      const res = await fetch(
        `/api/admin/store-stock-count/reports/${report.id}?light=1`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        },
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok)
        throw new Error(json.error ?? "Could not save report");
      setDraftCounts((prev) => {
        const next = { ...prev };
        for (const item of items) {
          if (draftCountsRef.current[item.itemId] === item.manualCount)
            delete next[item.itemId];
        }
        draftCountsRef.current = next;
        return next;
      });
      setAutoSaveStatus(
        Object.keys(dirtyCountsRef.current).length > 0 ? "pending" : "saved",
      );
      return true;
    } catch (err) {
      dirtyCountsRef.current = {
        ...Object.fromEntries(
          items.map((item) => [item.itemId, item.manualCount]),
        ),
        ...dirtyCountsRef.current,
      };
      setAutoSaveStatus("error");
      notify.error(
        err instanceof Error ? err.message : "Could not auto-save report",
      );
      nextFlushDelay = 250;
      return false;
    } finally {
      autoSaveInFlightRef.current = false;
      if (Object.keys(dirtyCountsRef.current).length > 0) {
        if (autoSaveTimerRef.current != null)
          window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = window.setTimeout(() => {
          autoSaveTimerRef.current = null;
          void flushAutoSave();
        }, nextFlushDelay);
      }
    }
  }, []);

  const scheduleAutoSave = useCallback(
    (counts: Record<string, number | null>) => {
      dirtyCountsRef.current = { ...dirtyCountsRef.current, ...counts };
      setAutoSaveStatus("pending");
      if (autoSaveTimerRef.current != null)
        window.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = window.setTimeout(() => {
        autoSaveTimerRef.current = null;
        void flushAutoSave();
      }, 150);
    },
    [flushAutoSave],
  );

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await fetch("/api/admin/store-stock-count/reports");
      const json = (await res.json()) as {
        reports?: StoreStockCountReportListItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load reports");
      setReports(json.reports ?? []);
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Failed to load reports",
      );
    } finally {
      setReportsLoading(false);
    }
  }, []);

  const openReport = useCallback(
    async (reportId: string) => {
      setBusy(true);
      try {
        if (autoSaveTimerRef.current != null) {
          window.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        while (autoSaveInFlightRef.current) {
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }
        if (Object.keys(dirtyCountsRef.current).length > 0) {
          const saved = await flushAutoSave();
          if (!saved)
            throw new Error(
              "Could not save pending changes before opening another report",
            );
        }
        const res = await fetch(
          `/api/admin/store-stock-count/reports/${reportId}`,
        );
        const json = (await res.json()) as {
          report?: StoreStockCountSavedReport;
          error?: string;
        };
        if (!res.ok || !json.report)
          throw new Error(json.error ?? "Failed to open report");
        setActiveReport(json.report);
        setVisibleWarehouseKeys(new Set());
        resetScanState();
        resetDraftState();
        setCountDrafts({});
        setHighlightedSku(null);
        setScrollTop(0);
        requestAnimationFrame(() => {
          if (viewportRef.current) viewportRef.current.scrollTop = 0;
        });
      } catch (err) {
        notify.error(
          err instanceof Error ? err.message : "Failed to open report",
        );
      } finally {
        setBusy(false);
      }
    },
    [flushAutoSave, resetDraftState, resetScanState],
  );

  const openReportWindow = useCallback((reportId: string) => {
    window.open(
      `/stock-count/reports/${reportId}`,
      "_blank",
      "noopener,noreferrer",
    );
  }, []);

  useEffect(() => {
    activeReportRef.current = activeReport;
  }, [activeReport]);

  useEffect(() => {
    draftCountsRef.current = draftCounts;
  }, [draftCounts]);

  useEffect(() => {
    if (initialReportId) void openReport(initialReportId);
  }, [initialReportId, openReport]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCompaniesLoading(true);
      try {
        const res = await fetch("/api/admin/store-stock-count/companies");
        const json = (await res.json()) as {
          companies?: SelectableErpCompany[];
          error?: string;
        };
        if (!res.ok)
          throw new Error(json.error ?? "Failed to load ERP companies");
        if (!cancelled) setCompanies(json.companies ?? []);
      } catch (err) {
        if (!cancelled)
          notify.error(
            err instanceof Error ? err.message : "Failed to load ERP companies",
          );
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }
    })();
    void loadReports();
    return () => {
      cancelled = true;
    };
  }, [loadReports]);

  const scrollToSku = useCallback(
    (skuKey: string) => {
      const idx = filteredRows.findIndex((r) => r.skuKey === skuKey);
      if (idx < 0 || !viewportRef.current) return;
      const top = Math.max(0, idx * ROW_H - VIEWPORT_H / 2 + ROW_H / 2);
      viewportRef.current.scrollTop = top;
      setScrollTop(top);
    },
    [filteredRows],
  );

  const drainPendingScans = useCallback(async () => {
    drainScheduledRef.current = false;
    if (scanBatchTimerRef.current != null) {
      window.clearTimeout(scanBatchTimerRef.current);
      scanBatchTimerRef.current = null;
    }
    const scans = pendingScansRef.current.splice(0, SCAN_BATCH_SIZE);
    if (scans.length === 0) return;

    const report = activeReportRef.current;
    const scanUpdates: ScanJob[] = [];
    const removeJobIds = new Set<string>();
    const returnedItems = new Map<string, StoreStockCountSavedItem>();
    const countedSkuKeys = new Set<string>();
    let lastSkuKey: string | null = null;

    if (report && report.status !== "submitted") {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      while (autoSaveInFlightRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 25));
      }
      if (Object.keys(dirtyCountsRef.current).length > 0) {
        const saved = await flushAutoSave();
        if (!saved) return;
      }
    }

    if (!report) {
      for (const code of scans) {
        scanUpdates.push({
          id: `none:barcode:${code}`,
          reportId: null,
          barcode: code,
          status: "errored",
          message: "Open or create a report first",
        });
      }
    } else if (report.status === "submitted") {
      for (const code of scans) {
        scanUpdates.push({
          id: `${report.id}:barcode:${code}`,
          reportId: report.id,
          barcode: code,
          status: "errored",
          message: "Report is submitted",
        });
      }
    } else {
      try {
        const res = await fetch(
          `/api/admin/store-stock-count/reports/${report.id}/scan`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ barcodes: scans }),
          },
        );
        const json = (await res.json()) as {
          ok?: boolean;
          error?: string;
          results?: Array<{
            ok?: boolean;
            error?: string;
            barcode: string;
            item?: StoreStockCountSavedItem;
            difference?: number | null;
          }>;
        };
        if (!res.ok || !json.ok || !json.results)
          throw new Error(json.error ?? "Could not count barcode batch");

        for (const result of json.results) {
          const barcodeJobId = `${report.id}:barcode:${result.barcode}`;
          if (!result.ok || !result.item) {
            scanUpdates.push({
              id: barcodeJobId,
              reportId: report.id,
              barcode: result.barcode,
              status: "errored",
              message: result.error ?? "Could not count barcode",
            });
            continue;
          }
          const previousReturned = returnedItems.get(result.item.id);
          if (
            !previousReturned ||
            (result.item.manualCount ?? 0) >=
              (previousReturned.manualCount ?? 0)
          ) {
            returnedItems.set(result.item.id, result.item);
          }
          countedSkuKeys.add(result.item.skuKey);
          lastSkuKey = result.item.skuKey;
          delete dirtyCountsRef.current[result.item.id];
          removeJobIds.add(barcodeJobId);
          scanUpdates.push({
            id: `${report.id}:item:${result.item.id}`,
            reportId: report.id,
            barcode: result.barcode,
            status: result.difference === 0 ? "done" : "difference",
            message: scanCountMessage(
              result.difference ?? null,
              result.item.manualCount ?? 0,
            ),
            sku: result.item.sku,
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not count barcode batch";
        notify.error(message);
        for (const code of scans) {
          scanUpdates.push({
            id: `${report.id}:barcode:${code}`,
            reportId: report.id,
            barcode: code,
            status: "errored",
            message,
          });
        }
      }
    }

    if (returnedItems.size > 0) {
      setActiveReport((current) => {
        if (!current || current.id !== report?.id) return current;
        const items = current.items.map(
          (item) => returnedItems.get(item.id) ?? item,
        );
        const next = { ...current, items };
        activeReportRef.current = next;
        return next;
      });
      setDraftCounts((prev) => {
        const next = { ...prev };
        for (const itemId of returnedItems.keys()) delete next[itemId];
        draftCountsRef.current = next;
        return next;
      });
      setCountDrafts((prev) => {
        const next = { ...prev };
        for (const skuKey of countedSkuKeys) delete next[skuKey];
        return next;
      });
    }
    if (scanUpdates.length > 0) {
      setScanQueue((prev) => {
        let next = prev.filter((job) => !removeJobIds.has(job.id));
        for (const update of scanUpdates) next = upsertScanJob(next, update);
        return next;
      });
    }
    if (lastSkuKey) {
      setHighlightedSku(lastSkuKey);
      requestAnimationFrame(() => scrollToSku(lastSkuKey));
    }
    if (pendingScansRef.current.length > 0 && !drainScheduledRef.current) {
      drainScheduledRef.current = true;
      window.setTimeout(() => void drainPendingScans(), 0);
    }
  }, [flushAutoSave, scrollToSku]);

  const processBarcode = useCallback(
    (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      const reportId = activeReportRef.current?.id ?? null;
      const barcodeJobId = `${reportId ?? "none"}:barcode:${code}`;
      pendingScansRef.current.push(code);
      setScanQueue((q) =>
        upsertScanJob(q, {
          id: barcodeJobId,
          reportId,
          barcode: code,
          status: "processing",
          message: "Processing",
        }),
      );
      if (pendingScansRef.current.length >= SCAN_BATCH_SIZE) {
        if (scanBatchTimerRef.current != null) {
          window.clearTimeout(scanBatchTimerRef.current);
          scanBatchTimerRef.current = null;
        }
        if (!drainScheduledRef.current) {
          drainScheduledRef.current = true;
          window.setTimeout(() => void drainPendingScans(), 0);
        }
      } else if (scanBatchTimerRef.current == null) {
        scanBatchTimerRef.current = window.setTimeout(() => {
          scanBatchTimerRef.current = null;
          if (!drainScheduledRef.current) {
            drainScheduledRef.current = true;
            void drainPendingScans();
          }
        }, SCAN_BATCH_DELAY_MS);
      }
    },
    [drainPendingScans],
  );
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      if (e.key === "Enter" || e.key === "Tab") {
        const code = scanBufferRef.current;
        if (code.trim().length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          e.stopImmediatePropagation();
          scanBufferRef.current = "";
          processBarcode(code);
        }
        return;
      }
      if (e.key.length !== 1) return;
      const now = performance.now();
      if (
        scanBufferRef.current.length > 0 &&
        now - lastScanKeyAtRef.current > 250
      ) {
        scanBufferRef.current = "";
      }
      const isScannerCadence =
        scanBufferRef.current.length > 0 &&
        now - lastScanKeyAtRef.current <= SCAN_KEY_INTERVAL_MS;
      lastScanKeyAtRef.current = now;
      if (
        countFocusedRef.current &&
        (scanBufferRef.current.length > 0 || isScannerCadence)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      const next = `${scanBufferRef.current}${e.key}`;
      scanBufferRef.current = next;
      const report = activeReportRef.current;
      if (
        report &&
        report.status !== "submitted" &&
        hasExactBarcodeMatch(next, report.items)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        scanBufferRef.current = "";
        processBarcode(next);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [processBarcode]);

  async function loadCompanyWarehouses(
    company: SelectableErpCompany,
  ): Promise<SelectableErpWarehouse[]> {
    const key = toCompanyKey(company);
    if (warehousesByCompany[key]) return warehousesByCompany[key];
    if (warehouseLoadingKeys.has(key)) return [];
    setWarehouseLoadingKeys((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/admin/store-stock-count/warehouses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: company.instanceId,
          erpCompany: company.erpCompany,
        }),
      });
      const json = (await res.json()) as {
        warehouses?: SelectableErpWarehouse[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load warehouses");
      const warehouses = json.warehouses ?? [];
      setWarehousesByCompany((prev) => ({ ...prev, [key]: warehouses }));
      return warehouses;
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Could not load warehouses",
      );
      return [];
    } finally {
      setWarehouseLoadingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function toggleWarehouse(key: string) {
    setSelectedWarehouseKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function toggleCompanyExpanded(company: SelectableErpCompany) {
    const key = toCompanyKey(company);
    setExpandedCompanyKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    await loadCompanyWarehouses(company);
  }

  async function toggleCompanyWarehouses(company: SelectableErpCompany) {
    const warehouses = await loadCompanyWarehouses(company);
    setSelectedWarehouseKeys((prev) => {
      const next = new Set(prev);
      const allSelected =
        warehouses.length > 0 && warehouses.every((w) => next.has(w.key));
      for (const warehouse of warehouses) {
        if (allSelected) next.delete(warehouse.key);
        else next.add(warehouse.key);
      }
      return next;
    });
  }

  async function deleteReport(reportId: string, title: string) {
    if (!window.confirm(`Delete report "${title}"? This cannot be undone.`))
      return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/store-stock-count/reports/${reportId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(json?.error ?? "Could not delete report");
      }
      if (activeReport?.id === reportId) {
        setActiveReport(null);
        setVisibleWarehouseKeys(new Set());
        resetScanState();
        resetDraftState();
        setCountDrafts({});
      }
      notify.success("Report deleted");
      void loadReports();
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Could not delete report",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createReport() {
    if (selectedWarehouses.length === 0) {
      notify.error("Select at least one warehouse");
      return;
    }
    const createdReportWindow = window.open("about:blank", "_blank");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/store-stock-count/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          companies: selectedCompanies,
          warehouses: selectedWarehouses,
        }),
      });
      const json = (await res.json()) as {
        report?: StoreStockCountSavedReport;
        error?: string;
      };
      if (!res.ok || !json.report)
        throw new Error(json.error ?? "Could not create report");
      notify.success(`Created report with ${json.report.items.length} items`);
      void loadReports();
      const reportUrl = `/stock-count/reports/${json.report.id}`;
      if (createdReportWindow) {
        createdReportWindow.opener = null;
        createdReportWindow.location.href = reportUrl;
      } else {
        openReportWindow(json.report.id);
      }
    } catch (err) {
      createdReportWindow?.close();
      notify.error(
        err instanceof Error ? err.message : "Could not create report",
      );
    } finally {
      setBusy(false);
    }
  }

  function commitDraft(item: StoreStockCountSavedItem, raw: string) {
    if (isLocked) return;
    const previous = countValue(item, draftCounts);
    const parsed = parseCountInput(raw, previous);
    if (raw.trim() !== "" && parsed === previous && !/^\d+$/.test(raw.trim())) {
      notify.error("Count must be a whole number >= 0");
      setCountDrafts((d) => ({
        ...d,
        [item.skuKey]: previous == null ? "" : String(previous),
      }));
      return;
    }
    const nextDrafts = { ...draftCountsRef.current, [item.id]: parsed };
    draftCountsRef.current = nextDrafts;
    setDraftCounts(nextDrafts);
    setActiveReport((current) => {
      if (!current || current.id !== activeReport?.id) return current;
      const next = {
        ...current,
        items: current.items.map((row) =>
          row.id === item.id ? { ...row, manualCount: parsed } : row,
        ),
      };
      activeReportRef.current = next;
      return next;
    });
    scheduleAutoSave({ [item.id]: parsed });
    if (activeReport && parsed != null) {
      const diff = difference(parsed, item.stockSum);
      setScanQueue((q) =>
        upsertScanJob(q, {
          id: `${activeReport.id}:item:${item.id}`,
          reportId: activeReport.id,
          barcode: item.barcodes[0] ?? item.sku,
          status: diff === 0 ? "done" : "difference",
          message: scanCountMessage(diff, parsed),
          sku: item.sku,
        }),
      );
    }
    setCountDrafts((d) => {
      const next = { ...d };
      delete next[item.skuKey];
      return next;
    });
  }

  async function importQbStockFile(file: File) {
    if (!activeReport) return;
    setQbImportBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(
        `/api/admin/store-stock-count/reports/${activeReport.id}/qb-import`,
        {
          method: "POST",
          body: formData,
        },
      );
      const json = (await res.json()) as {
        report?: StoreStockCountSavedReport;
        updatedCount?: number;
        missingSkus?: string[];
        error?: string;
      };
      if (!res.ok || !json.report)
        throw new Error(json.error ?? "Could not import QB stock");
      setActiveReport(json.report);
      activeReportRef.current = json.report;
      const missingCount = json.missingSkus?.length ?? 0;
      notify.success(
        missingCount > 0
          ? `Imported QB stock for ${json.updatedCount ?? 0} items. ${missingCount} item codes were not found.`
          : `Imported QB stock for ${json.updatedCount ?? 0} items`,
      );
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Could not import QB stock",
      );
    } finally {
      setQbImportBusy(false);
      if (qbImportInputRef.current) qbImportInputRef.current.value = "";
    }
  }
  async function submitReport() {
    if (!activeReport) return;
    if (
      !window.confirm("Submit and lock this report? It cannot be edited again.")
    )
      return;
    setBusy(true);
    try {
      while (autoSaveInFlightRef.current) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
      if (Object.keys(dirtyCountsRef.current).length > 0) {
        const saved = await flushAutoSave();
        if (!saved)
          throw new Error("Could not save pending changes before submit");
      }
      const res = await fetch(
        `/api/admin/store-stock-count/reports/${activeReport.id}/submit`,
        { method: "POST" },
      );
      const json = (await res.json()) as {
        report?: StoreStockCountSavedReport;
        error?: string;
      };
      if (!res.ok || !json.report)
        throw new Error(json.error ?? "Could not submit report");
      setActiveReport(json.report);
      resetScanState();
      notify.success("Report submitted");
      void loadReports();
    } catch (err) {
      notify.error(
        err instanceof Error ? err.message : "Could not submit report",
      );
    } finally {
      setBusy(false);
    }
  }

  const countedCount =
    activeReport?.items.filter((row) => countValue(row, draftCounts) != null)
      .length ?? 0;
  const canSubmit =
    activeReport?.status === "draft" && autoSaveStatus !== "saving";
  const autoSaveLabel =
    autoSaveStatus === "saving"
      ? "Saving"
      : autoSaveStatus === "pending"
        ? "Save pending"
        : autoSaveStatus === "error"
          ? "Auto-save failed"
          : "Saved";
  const scanCardSearch = scanCardQuery.trim().toLowerCase();
  const matchesScanCardSearch = (job: ScanJob) =>
    !scanCardSearch ||
    [job.sku, job.barcode]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(scanCardSearch);
  const activeScanQueue = activeReport
    ? scanQueue.filter((job) => job.reportId === activeReport.id)
    : [];
  const processingScans = activeScanQueue.filter(
    (job) =>
      (job.status === "processing" || job.status === "errored") &&
      matchesScanCardSearch(job),
  );
  const reportCountJobs: ScanJob[] = activeReport
    ? activeReport.items
        .flatMap((item) => {
          const manualCount = item.manualCount;
          const diff = difference(manualCount, item.stockSum);
          if (manualCount == null || diff == null) return [];
          return [
            {
              id: `${activeReport.id}:item:${item.id}`,
              reportId: activeReport.id,
              barcode: item.barcodes[0] ?? item.sku,
              sku: item.sku,
              itemId: item.id,
              status: diff === 0 ? "done" : "difference",
              message: scanCountMessage(diff, manualCount),
              totalCount: item.stockSum,
              manualCount,
              diff,
              qbStock: item.qbStock,
            } satisfies ScanJob,
          ];
        })
        .filter((job) => matchesScanCardSearch(job))
    : [];
  const doneScans = reportCountJobs.filter((job) => job.diff === 0);
  const ongoingScans =
    activeReport?.status === "draft"
      ? reportCountJobs.filter(
          (job) => typeof job.diff === "number" && job.diff < 0,
        )
      : [];
  const differenceScans = reportCountJobs.filter(
    (job) =>
      typeof job.diff === "number" &&
      (job.diff > 0 || (activeReport?.status === "submitted" && job.diff < 0)),
  );
  const selectedCardItem = selectedCardItemId
    ? (activeReport?.items.find((item) => item.id === selectedCardItemId) ??
      null)
    : null;

  const pendingCount =
    activeReport?.items.filter((item) => item.manualCount == null).length ?? 0;
  const ongoingCount =
    activeReport?.status === "draft"
      ? activeReport.items.filter((item) => {
          const diff = difference(item.manualCount, item.stockSum);
          return diff != null && diff < 0;
        }).length
      : 0;
  const doneCount =
    activeReport?.items.filter(
      (item) => difference(item.manualCount, item.stockSum) === 0,
    ).length ?? 0;
  const differenceCount =
    activeReport?.items.filter((item) => {
      const diff = difference(item.manualCount, item.stockSum);
      return (
        diff != null &&
        (diff > 0 || (activeReport.status === "submitted" && diff < 0))
      );
    }).length ?? 0;
  const totalManualCount =
    activeReport?.items.reduce((sum, item) => sum + (item.manualCount ?? 0), 0) ??
    0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Store stock count
          </h1>
          <p className="text-sm text-muted-foreground">
            Create saved reports from live ERP warehouse stock, scan
            continuously, save drafts, and submit to lock.
          </p>
        </div>
        {!standalone ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setHistoryOpen((open) => !open)}
          >
            <History className="size-4" aria-hidden />
            History
          </Button>
        ) : null}
      </div>

      {!standalone ? (
        <section className="space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h2 className="text-sm font-medium">
                New warehouse stock report
              </h2>
              <p className="text-xs text-muted-foreground">
                Select ERP company sources. Reports pull only Main or Shop
                warehouses as separate stock columns.
              </p>
            </div>
            {companiesLoading ? (
              <Loader2
                className="size-4 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-[16rem] max-w-md flex-1"
              value={title}
              disabled={busy}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Report name"
            />
            <Button
              type="button"
              disabled={busy || selectedWarehouses.length === 0}
              onClick={createReport}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-4" aria-hidden />
              )}
              Create report
            </Button>
          </div>
          <div className="grid max-h-72 gap-x-8 gap-y-1 overflow-y-auto pr-2 md:grid-cols-2 xl:grid-cols-3">
            {companies.map((c) => {
              const key = toCompanyKey(c);
              const warehouses = warehousesByCompany[key] ?? [];
              const expanded = expandedCompanyKeys.has(key);
              const loadingWarehouses = warehouseLoadingKeys.has(key);
              const allSelected =
                warehouses.length > 0 &&
                warehouses.every((w) => selectedWarehouseKeys.has(w.key));
              return (
                <div
                  key={key}
                  className="rounded border border-transparent px-1 py-1 hover:border-border"
                >
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      disabled={busy}
                      onClick={() => void toggleCompanyExpanded(c)}
                    >
                      {expanded ? (
                        <ChevronDown className="size-4" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4" aria-hidden />
                      )}
                    </Button>
                    <input
                      type="checkbox"
                      className="size-4 shrink-0"
                      checked={allSelected}
                      disabled={busy || loadingWarehouses}
                      onChange={() => void toggleCompanyWarehouses(c)}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-sm"
                      title={companyLabel(c)}
                    >
                      {companyLabel(c)}
                    </span>
                    {loadingWarehouses ? (
                      <Loader2
                        className="size-4 animate-spin text-muted-foreground"
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  {expanded ? (
                    <div className="mt-1 space-y-1 pl-9">
                      {warehouses.map((warehouse) => (
                        <label
                          key={warehouse.key}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/50"
                        >
                          <input
                            type="checkbox"
                            className="size-4 shrink-0"
                            checked={selectedWarehouseKeys.has(warehouse.key)}
                            disabled={busy}
                            onChange={() => toggleWarehouse(warehouse.key)}
                          />
                          <span
                            className="min-w-0 flex-1 truncate"
                            title={warehouse.label}
                          >
                            {warehouse.label}
                          </span>
                        </label>
                      ))}
                      {!loadingWarehouses && warehouses.length === 0 ? (
                        <p className="px-2 py-1 text-xs text-muted-foreground">
                          No Main or Shop warehouses.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {companies.length === 0 && !companiesLoading ? (
              <p className="text-sm text-muted-foreground">
                No ERP company sources available.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeReport ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground">Pending</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {pendingCount}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground">Ongoing</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {ongoingCount}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground">Done</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {doneCount}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground">Difference</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {differenceCount}
              </div>
            </div>
            <div className="rounded-lg border p-4">
              <div className="text-xs text-muted-foreground">Total Count</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">
                {totalManualCount}
              </div>
            </div>
          </div>
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-2.5 left-2 size-4 text-muted-foreground" />
            <Input
              className="pl-8"
              value={scanCardQuery}
              onChange={(e) => setScanCardQuery(e.target.value)}
              placeholder="Search status cards by SKU or barcode"
            />
          </div>
          <div className="grid gap-3 xl:grid-cols-3">
            <ScanStatusCard
              title="Ongoing"
              jobs={ongoingScans}
              empty="No ongoing counts"
              tone="warning"
              onSelectItem={setSelectedCardItemId}
              showQbStock={hasQbStock}
            />
            <ScanStatusCard
              title="Done"
              jobs={doneScans}
              empty="No completed counts"
              tone="success"
              onSelectItem={setSelectedCardItemId}
              showQbStock={hasQbStock}
            />
            <ScanStatusCard
              title="Difference"
              jobs={differenceScans}
              empty="No differences"
              tone="warning"
              onSelectItem={setSelectedCardItemId}
              showQbStock={hasQbStock}
            />
          </div>
        </div>
      ) : null}

      {!standalone && historyOpen ? (
        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Report history</h2>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={reportsLoading}
              onClick={loadReports}
            >
              <RefreshCw className="size-4" aria-hidden />
              Refresh
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[10rem_10rem]">
            <Input
              type="date"
              value={reportDateFrom}
              onChange={(e) => setReportDateFrom(e.target.value)}
            />
            <Input
              type="date"
              value={reportDateTo}
              onChange={(e) => setReportDateTo(e.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {filteredReports.map((report) => (
              <div
                key={report.id}
                className={`flex flex-wrap items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50 ${activeReport?.id === report.id ? "bg-primary/5" : ""}`}
              >
                <button
                  type="button"
                  className="min-w-[14rem] flex-1 text-left"
                  onClick={() => {
                    setHistoryOpen(false);
                    openReportWindow(report.id);
                  }}
                >
                  <span className="block font-medium">{report.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {report.countedCount}/{report.itemCount} counted -{" "}
                    {formatDate(report.updatedAt)}
                  </span>
                </button>
                <span className="w-24 text-xs uppercase text-muted-foreground">
                  {report.status}
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => void deleteReport(report.id, report.title)}
                >
                  <Trash2 className="size-3" aria-hidden />
                  Delete
                </Button>
              </div>
            ))}
            {filteredReports.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                No saved reports found.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      {!activeReport ? (
        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          Create or open a report to start counting.
        </div>
      ) : (
        <section className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{activeReport.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {countedCount}/{activeReport.items.length} counted -{" "}
                  {activeReport.status === "submitted"
                    ? `Submitted ${activeReport.submittedAt ? formatDate(activeReport.submittedAt) : ""}`
                    : autoSaveLabel}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" asChild>
                  <a
                    href={`/api/admin/store-stock-count/reports/${activeReport.id}/qb-template`}
                  >
                    <Download className="size-4" aria-hidden />
                    QB Template
                  </a>
                </Button>
                <input
                  ref={qbImportInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  disabled={qbImportBusy || isLocked}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void importQbStockFile(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={qbImportBusy || isLocked}
                  onClick={() => qbImportInputRef.current?.click()}
                >
                  {qbImportBusy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="size-4" aria-hidden />
                  )}
                  Import QB
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a
                    href={`/api/admin/store-stock-count/reports/${activeReport.id}/export`}
                  >
                    <Download className="size-4" aria-hidden />
                    Export
                  </a>
                </Button>
                {canSubmit ? (
                  <Button type="button" disabled={busy} onClick={submitReport}>
                    <Send className="size-4" aria-hidden />
                    Submit
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-2 md:grid-cols-4">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search SKU, name, barcode"
              />
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={countFilter}
                onChange={(e) => setCountFilter(e.target.value as CountFilter)}
              >
                <option value="all">All counts</option>
                <option value="counted">Counted only</option>
                <option value="uncounted">Uncounted only</option>
              </select>
              <div className="flex gap-1">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={stockOp}
                  onChange={(e) => setStockOp(e.target.value as NumberOp)}
                >
                  <option value="">Stock</option>
                  <option value="lt">Stock less than</option>
                  <option value="gt">Stock greater than</option>
                  <option value="eq">Stock equals</option>
                </select>
                <Input
                  value={stockTarget}
                  onChange={(e) => setStockTarget(e.target.value)}
                  inputMode="numeric"
                  className="w-20"
                />
              </div>
              <div className="flex gap-1">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={manualOp}
                  onChange={(e) => setManualOp(e.target.value as NumberOp)}
                >
                  <option value="">Manual</option>
                  <option value="lt">Manual less than</option>
                  <option value="gt">Manual greater than</option>
                  <option value="eq">Manual equals</option>
                </select>
                <Input
                  value={manualTarget}
                  onChange={(e) => setManualTarget(e.target.value)}
                  inputMode="numeric"
                  className="w-20"
                />
              </div>
            </div>
            <div className="flex max-w-xs gap-1">
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={diffOp}
                onChange={(e) => setDiffOp(e.target.value as NumberOp)}
              >
                <option value="">Difference</option>
                <option value="lt">Diff less than</option>
                <option value="gt">Diff greater than</option>
                <option value="eq">Diff equals</option>
              </select>
              <Input
                value={diffTarget}
                onChange={(e) => setDiffTarget(e.target.value)}
                inputMode="numeric"
                className="w-20"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <div className="min-w-[980px]">
              <div
                className="grid gap-2 border-b bg-muted/40 py-2 pl-3 pr-8 text-xs font-medium text-muted-foreground"
                style={{ gridTemplateColumns: tableGridColumns }}
              >
                <span className="min-w-0">SKU</span>
                <span className="min-w-0">Name</span>
                <span className="relative min-w-0 pr-7">
                  <span className="block truncate">Barcode</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute top-1/2 right-0 size-6 -translate-y-1/2"
                    disabled={
                      activeReport.warehouses.length === 0 ||
                      visibleLoadedKeys.length ===
                        activeReport.warehouses.length
                    }
                    onClick={() =>
                      setVisibleWarehouseKeys(
                        new Set(activeReport.warehouses.map((w) => w.key)),
                      )
                    }
                  >
                    <ChevronRight className="size-3" aria-hidden />
                  </Button>
                </span>
                {visibleWarehouses.map((w) => (
                  <span
                    key={w.key}
                    className="relative min-w-0 pl-7 text-right"
                    title={`${w.erpCompany} - ${w.instanceLabel}`}
                  >
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="absolute top-1/2 left-0 size-6 -translate-y-1/2"
                      onClick={() =>
                        setVisibleWarehouseKeys((prev) => {
                          const next = new Set(prev);
                          next.delete(w.key);
                          return next;
                        })
                      }
                    >
                      <ChevronLeft className="size-3" aria-hidden />
                    </Button>
                    <span className="block whitespace-normal break-words leading-tight">
                      {w.label}
                    </span>
                  </span>
                ))}
                <span className="relative min-w-0 pl-7 text-right">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute top-1/2 left-0 size-6 -translate-y-1/2"
                    disabled={visibleLoadedKeys.length === 0}
                    onClick={() => setVisibleWarehouseKeys(new Set())}
                  >
                    <ChevronLeft className="size-3" aria-hidden />
                  </Button>
                  <span className="block truncate">Total Stock</span>
                </span>
                {hasQbStock ? (
                  <span className="min-w-0 text-right">QB Stock</span>
                ) : null}
                <span className="min-w-0 text-center">Manual Count</span>
                <span className="min-w-0 text-right">Diff</span>
              </div>
              <div
                ref={viewportRef}
                className="overflow-y-auto"
                style={{ height: VIEWPORT_H }}
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              >
                <div style={{ height: padTop }} />
                {visibleRows.map((row) => {
                  const manualCount = countValue(row, draftCounts);
                  const diff = difference(manualCount, row.stockSum);
                  const draft = countDrafts[row.skuKey];
                  const highlighted = highlightedSku === row.skuKey;
                  return (
                    <div
                      key={row.id}
                      className={`grid items-center gap-2 border-b px-3 text-sm ${highlighted ? "bg-amber-100/80 dark:bg-amber-950/40" : ""}`}
                      style={{
                        height: ROW_H,
                        gridTemplateColumns: tableGridColumns,
                      }}
                    >
                      <span className="truncate font-medium" title={row.sku}>
                        {row.sku}
                      </span>
                      <span
                        className="truncate"
                        title={row.description || row.name}
                      >
                        {row.name}
                      </span>
                      <span
                        className="truncate text-xs text-muted-foreground"
                        title={row.barcodes.join(", ")}
                      >
                        {row.barcodes[0] ?? "-"}
                      </span>
                      {visibleLoadedKeys.map((key) => (
                        <span
                          key={key}
                          className="min-w-0 text-right tabular-nums"
                        >
                          {row.stockByWarehouse[key] ?? 0}
                        </span>
                      ))}
                      <span className="min-w-0 text-right tabular-nums">
                        {row.stockSum ?? "-"}
                      </span>
                      {hasQbStock ? (
                        <span className="min-w-0 text-right tabular-nums">
                          {row.qbStock ?? "-"}
                        </span>
                      ) : null}
                      <Input
                        className="h-8 w-full text-right tabular-nums"
                        inputMode="numeric"
                        value={
                          draft !== undefined
                            ? draft
                            : manualCount == null
                              ? ""
                              : String(manualCount)
                        }
                        disabled={busy || isLocked}
                        onFocus={() => {
                          countFocusedRef.current = true;
                        }}
                        onBlur={(e) => {
                          countFocusedRef.current = false;
                          commitDraft(row, e.target.value);
                        }}
                        onChange={(e) =>
                          setCountDrafts((d) => ({
                            ...d,
                            [row.skuKey]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                      <span
                        className={`min-w-0 text-right tabular-nums ${diff == null ? "text-muted-foreground" : diff < 0 ? "text-destructive" : diff > 0 ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                      >
                        {diff == null ? "-" : diff > 0 ? `+${diff}` : diff}
                      </span>
                    </div>
                  );
                })}
                <div style={{ height: padBottom }} />
              </div>
            </div>
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              {filteredRows.length} pending from {activeReport.items.length}{" "}
              items
            </p>
          </div>
          <section className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Processing</h2>
              <span className="text-xs text-muted-foreground">
                {processingScans.length}
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {processingScans.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                >
                  <span className="min-w-0 truncate font-medium">
                    {job.sku ?? job.barcode}
                  </span>
                  <span
                    className={
                      job.status === "errored"
                        ? "shrink-0 text-xs text-destructive"
                        : "shrink-0 text-xs text-muted-foreground"
                    }
                  >
                    {job.message}
                  </span>
                </div>
              ))}
              {processingScans.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No processing scans.
                </p>
              ) : null}
            </div>
          </section>
        </section>
      )}

      <Dialog
        open={selectedCardItem != null}
        onOpenChange={(open) => !open && setSelectedCardItemId(null)}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCardItem?.sku ?? "Warehouse stock"}
            </DialogTitle>
            <DialogDescription>{selectedCardItem?.name}</DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden rounded-md border">
            <div className="grid grid-cols-[minmax(12rem,1fr)_6rem] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
              <span>Warehouse</span>
              <span className="text-right">Stock</span>
            </div>
            <div className="max-h-80 overflow-y-auto text-sm">
              {activeReport?.warehouses.map((warehouse) => (
                <div
                  key={warehouse.key}
                  className="grid grid-cols-[minmax(12rem,1fr)_6rem] gap-3 border-b px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block font-medium">{warehouse.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {warehouse.erpCompany}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    {selectedCardItem?.stockByWarehouse[warehouse.key] ?? 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
