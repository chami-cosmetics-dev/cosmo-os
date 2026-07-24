"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notify } from "@/lib/notify";

type AssistItem = {
  sku: string;
  productTitle: string;
  brand: string | null;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
  lastPurchaseDate: string | null;
  windowStart: string;
  windowEnd: string;
  salesInWindow: number;
  suggestedRop: number;
  totalStock: number | null;
  currentRops: Record<string, number>;
  currentRopSummary: number | null;
};

type PageData = {
  asOfDate: string;
  mode?: "priority" | "top_sales";
  priorityFilter: string;
  page: number;
  limit: number;
  total: number;
  canManageRops: boolean;
  ropColumnKeys: string[];
  stockWarnings: Array<{ source: string; message: string }>;
  items: AssistItem[];
};

type RefreshResult = {
  updatedRows?: number;
  sources?: Array<{ label: string; status: string; error: string | null }>;
  error?: string;
};

type Props = {
  canManageRops: boolean;
};

/** View selector: priority filters + top-sales ranking mode */
const VIEW_OPTIONS = [
  { value: "Top Priority", label: "Top Priority", mode: "priority" as const },
  { value: "Non Priority", label: "Non Priority", mode: "priority" as const },
  { value: "Discontinue", label: "Discontinue", mode: "priority" as const },
  { value: "Newly Added", label: "Newly Added", mode: "priority" as const },
  { value: "all", label: "All priorities", mode: "priority" as const },
  {
    value: "top_sales",
    label: "Top sales (30 days)",
    mode: "top_sales" as const,
  },
] as const;

export function OsfRopAssistPanel({ canManageRops }: Props) {
  const [busyKey, setBusyKey] = useState<"refresh" | "load" | "save" | null>(null);
  const isBusy = busyKey !== null;

  const [syncBanner, setSyncBanner] = useState<string | null>(null);
  const [syncTone, setSyncTone] = useState<"ok" | "warn" | "err">("ok");

  const [view, setView] = useState<string>("Top Priority");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<PageData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [qtyBySku, setQtyBySku] = useState<Record<string, number>>({});

  const manage = canManageRops && (data?.canManageRops ?? canManageRops);
  const isTopSales = view === "top_sales";

  async function runRefresh() {
    setBusyKey("refresh");
    setSyncBanner("Syncing Product Priority from ERP…");
    setSyncTone("ok");
    try {
      const res = await fetch("/api/admin/osf/assist/refresh", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as RefreshResult;
      if (!res.ok) {
        throw new Error(json.error ?? `Refresh failed (${res.status})`);
      }
      const failed = (json.sources ?? []).filter((s) => s.status === "failed");
      const ok = (json.sources ?? []).filter((s) => s.status === "ok");
      if (failed.length > 0 && ok.length > 0) {
        setSyncTone("warn");
        setSyncBanner(
          `Priority sync partial: ${ok.map((s) => s.label).join(", ")} ok; ${failed
            .map((s) => `${s.label}${s.error ? ` (${s.error})` : ""}`)
            .join("; ")}`,
        );
      } else {
        setSyncTone("ok");
        setSyncBanner(
          `Priority sync complete (${json.updatedRows ?? 0} row(s) updated).`,
        );
      }
      return true;
    } catch (err) {
      setSyncTone("err");
      const message = err instanceof Error ? err.message : "Refresh failed";
      setSyncBanner(message);
      notify.error(message);
      return false;
    } finally {
      setBusyKey(null);
    }
  }

  async function loadPageData(opts?: {
    view?: string;
    page?: number;
    q?: string;
  }) {
    const v = opts?.view ?? view;
    const pg = opts?.page ?? page;
    const search = opts?.q ?? q;
    const topSales = v === "top_sales";
    setBusyKey("load");
    try {
      const params = new URLSearchParams({
        mode: topSales ? "top_sales" : "priority",
        page: String(pg),
        limit: "50",
      });
      if (!topSales) params.set("priority", v);
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/admin/osf/assist/page-data?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error ?? `Load failed (${res.status})`);
      }
      const next = json as PageData;
      setData(next);
      setSelected(new Set());
      const nextQty: Record<string, number> = {};
      for (const item of next.items) {
        nextQty[item.sku] = item.suggestedRop;
      }
      setQtyBySku(nextQty);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Failed to load assist data");
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await runRefresh();
      if (cancelled || !ok) return;
      await loadPageData({ page: 1 });
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: refresh + first page load
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount bootstrap
  }, []);

  async function onManualRefresh() {
    const ok = await runRefresh();
    if (ok) await loadPageData();
  }

  function toggleSku(sku: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  function toggleAllOnPage() {
    if (!data) return;
    const skus = data.items.map((i) => i.sku);
    setSelected((prev) => {
      const allSelected = skus.every((s) => prev.has(s));
      if (allSelected) return new Set();
      return new Set(skus);
    });
  }

  function acceptSelected() {
    if (!data) return;
    setQtyBySku((prev) => {
      const next = { ...prev };
      for (const item of data.items) {
        if (selected.has(item.sku)) next[item.sku] = item.suggestedRop;
      }
      return next;
    });
    notify.success("Accepted suggested ROP for selected rows (not saved yet)");
  }

  async function saveSelected() {
    if (!manage || selected.size === 0) return;
    setBusyKey("save");
    try {
      const items = [...selected].map((sku) => ({
        sku,
        ropQty: Math.max(0, Math.floor(Number(qtyBySku[sku] ?? 0))),
      }));
      const res = await fetch("/api/admin/osf/assist/rops", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Save failed (${res.status})`);

      const errCount = Array.isArray(json.errors) ? json.errors.length : 0;
      if (errCount > 0) {
        notify.success(
          `Saved ${json.updatedSkus ?? 0} SKU(s); ${errCount} issue(s)`,
        );
      } else {
        notify.success(
          `Saved ROP for ${json.updatedSkus ?? 0} SKU(s) (${json.updatedCells ?? 0} cells)`,
        );
      }
      await loadPageData();
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusyKey(null);
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">ROP Assist</h3>
          <p className="text-sm text-muted-foreground">
            On open, Product Priority syncs from both ERPs. Use priority filters or Top
            sales (30 days) to rank all SKUs by sales. Accept or edit suggested ROPs, then
            Save. Generate OSF uses saved ROPs with live stock at download time.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isBusy}
          onClick={() => void onManualRefresh()}
        >
          {busyKey === "refresh" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="size-4" aria-hidden />
              Refresh
            </>
          )}
        </Button>
      </div>

      {syncBanner && (
        <p
          className={
            syncTone === "err"
              ? "text-sm text-destructive"
              : syncTone === "warn"
                ? "text-sm text-amber-700 dark:text-amber-400"
                : "text-sm text-muted-foreground"
          }
          role="status"
        >
          {busyKey === "refresh" ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {syncBanner}
            </span>
          ) : (
            syncBanner
          )}
        </p>
      )}

      {data?.stockWarnings && data.stockWarnings.length > 0 && (
        <p className="text-sm text-amber-700 dark:text-amber-400" role="status">
          Stock soft-fail:{" "}
          {data.stockWarnings.map((w) => `${w.source}: ${w.message}`).join("; ")}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">View</span>
          <select
            className="flex h-9 w-full min-w-[12rem] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            value={view}
            disabled={isBusy}
            onChange={(e) => {
              const next = e.target.value;
              setView(next);
              setPage(1);
              void loadPageData({ view: next, page: 1 });
            }}
          >
            {VIEW_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {isTopSales && (
          <p className="pb-2 text-xs text-muted-foreground">
            Fixed last-30-days window · sorted by sales (high → low)
          </p>
        )}
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">Search</span>
          <Input
            value={qDraft}
            disabled={isBusy}
            placeholder="SKU or title"
            className="min-w-[12rem]"
            onChange={(e) => setQDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setQ(qDraft);
                setPage(1);
                void loadPageData({ q: qDraft, page: 1 });
              }
            }}
          />
        </label>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isBusy}
          onClick={() => {
            setQ(qDraft);
            setPage(1);
            void loadPageData({ q: qDraft, page: 1 });
          }}
        >
          {busyKey === "load" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading...
            </>
          ) : (
            "Search"
          )}
        </Button>
      </div>

      {manage && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isBusy || selected.size === 0}
            onClick={acceptSelected}
          >
            Accept suggested
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={isBusy || selected.size === 0}
            onClick={() => void saveSelected()}
          >
            {busyKey === "save" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Saving...
              </>
            ) : (
              `Save selected (${selected.size})`
            )}
          </Button>
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {manage && (
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    disabled={isBusy || !data?.items.length}
                    checked={
                      !!data?.items.length &&
                      data.items.every((i) => selected.has(i.sku))
                    }
                    onChange={toggleAllOnPage}
                  />
                </TableHead>
              )}
              <TableHead>SKU</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Window</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Current ROP</TableHead>
              <TableHead className="text-right">Suggested</TableHead>
              {manage && <TableHead className="text-right">Save qty</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {!data?.items.length ? (
              <TableRow>
                <TableCell
                  colSpan={manage ? 10 : 8}
                  className="text-center text-muted-foreground"
                >
                  {busyKey === "load" || busyKey === "refresh"
                    ? "Loading…"
                    : "No SKUs match this filter."}
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((item) => {
                const priorityLabel =
                  [item.erp1ProductPriority, item.erp2ProductPriority]
                    .filter(Boolean)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .join(" / ") || "—";
                return (
                  <TableRow key={item.sku}>
                    {manage && (
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.sku}`}
                          disabled={isBusy}
                          checked={selected.has(item.sku)}
                          onChange={() => toggleSku(item.sku)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                    <TableCell className="max-w-[14rem] truncate">
                      {item.productTitle}
                    </TableCell>
                    <TableCell className="text-xs">{priorityLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {item.windowStart} → {item.windowEnd}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.salesInWindow}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.totalStock == null ? "—" : item.totalStock}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.currentRopSummary == null ? "—" : item.currentRopSummary}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.suggestedRop}
                    </TableCell>
                    {manage && (
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="ml-auto h-8 w-20 text-right"
                          disabled={isBusy}
                          value={qtyBySku[item.sku] ?? item.suggestedRop}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setQtyBySku((prev) => ({
                              ...prev,
                              [item.sku]: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0,
                            }));
                          }}
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {data.total} SKU(s) · page {data.page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy || page <= 1}
              onClick={() => {
                const next = page - 1;
                setPage(next);
                void loadPageData({ page: next });
              }}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isBusy || page >= totalPages}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                void loadPageData({ page: next });
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
