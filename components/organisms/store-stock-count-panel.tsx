"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { companyLabel, toCompanyKey } from "@/lib/store-stock-count/company-key";
import { difference } from "@/lib/store-stock-count/difference";
import { matchScan } from "@/lib/store-stock-count/match-scan";
import {
  fillMissingCompanyStock,
  markCompanyUnavailable,
  mergeCompanyItems,
  sumLiveStock,
} from "@/lib/store-stock-count/merge-items";
import type {
  CompanyLoadError,
  SelectableErpCompany,
  StoreStockCountItemsResponse,
  StoreStockCountRow,
} from "@/lib/store-stock-count/types";

const ROW_H = 44;
const OVERSCAN = 16;
const VIEWPORT_H = 480;

type CountsMap = Record<string, number | null>;

function parseCountInput(raw: string, previous: number | null): number | null {
  const t = raw.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return previous;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return previous;
  return n;
}

export function StoreStockCountPanel() {
  const [companies, setCompanies] = useState<SelectableErpCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loadedKeys, setLoadedKeys] = useState<string[]>([]);
  const [rows, setRows] = useState<StoreStockCountRow[]>([]);
  const [counts, setCounts] = useState<CountsMap>({});
  const [loadErrors, setLoadErrors] = useState<CompanyLoadError[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const [barcode, setBarcode] = useState("");
  const [highlightedSku, setHighlightedSku] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({});

  const barcodeRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const countFocusedRef = useRef(false);

  const companyByKey = useMemo(() => {
    const m = new Map<string, SelectableErpCompany>();
    for (const c of companies) m.set(toCompanyKey(c), c);
    return m;
  }, [companies]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCompaniesLoading(true);
      try {
        const res = await fetch("/api/admin/store-stock-count/companies");
        const json = (await res.json()) as { companies?: SelectableErpCompany[]; error?: string };
        if (!res.ok) {
          notify.error(json.error ?? "Failed to load ERP companies");
          if (!cancelled) setCompanies([]);
          return;
        }
        if (!cancelled) setCompanies(json.companies ?? []);
      } catch {
        if (!cancelled) notify.error("Failed to load ERP companies");
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToSku = useCallback(
    (skuKey: string, list: StoreStockCountRow[]) => {
      const idx = list.findIndex((r) => r.skuKey === skuKey);
      if (idx < 0 || !viewportRef.current) return;
      const top = Math.max(0, idx * ROW_H - VIEWPORT_H / 2 + ROW_H / 2);
      viewportRef.current.scrollTop = top;
      setScrollTop(top);
    },
    [],
  );

  const loadCompanies = useCallback(
    async (keys: string[], keepCounts: boolean) => {
      if (keys.length === 0) {
        notify.error("Select at least one company");
        return;
      }
      setBusy(true);
      setLoadErrors([]);
      let nextRows: StoreStockCountRow[] = [];
      const errors: CompanyLoadError[] = [];
      const successKeys: string[] = [];
      const failedKeys: string[] = [];

      for (const key of keys) {
        const c = companyByKey.get(key);
        if (!c) continue;
        setLoadingLabel(companyLabel(c));
        try {
          const res = await fetch("/api/admin/store-stock-count/items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instanceId: c.instanceId, erpCompany: c.erpCompany }),
          });
          const json = (await res.json()) as StoreStockCountItemsResponse & {
            error?: string;
            instanceId?: string;
            erpCompany?: string;
          };
          if (!res.ok) {
            errors.push({
              instanceId: c.instanceId,
              erpCompany: c.erpCompany,
              message: json.error ?? `Failed (${res.status})`,
            });
            failedKeys.push(key);
            continue;
          }
          successKeys.push(key);
          nextRows = mergeCompanyItems({
            existing: nextRows,
            companyKey: key,
            items: json.items ?? [],
            replaceCompanyStock: true,
          });
        } catch (err) {
          errors.push({
            instanceId: c.instanceId,
            erpCompany: c.erpCompany,
            message: err instanceof Error ? err.message : "Request failed",
          });
          failedKeys.push(key);
        }
      }

      nextRows = fillMissingCompanyStock(nextRows, successKeys, 0);
      for (const key of failedKeys) {
        nextRows = markCompanyUnavailable(nextRows, key);
      }

      setRows(nextRows);
      setLoadedKeys(keys);
      setLoadErrors(errors);
      if (!keepCounts) {
        setCounts({});
        setCountDrafts({});
      } else {
        setCounts((prev) => {
          const next: CountsMap = {};
          for (const row of nextRows) {
            if (row.skuKey in prev) next[row.skuKey] = prev[row.skuKey] ?? null;
          }
          return next;
        });
      }
      setHighlightedSku(null);
      setLoadingLabel(null);
      setBusy(false);
      if (errors.length > 0) {
        notify.error(
          errors.length === keys.length
            ? "Could not load stock from ERP"
            : `${errors.length} company load(s) failed — stock marked unavailable`,
        );
      } else {
        notify.success(`Loaded ${nextRows.length} items`);
      }
      requestAnimationFrame(() => barcodeRef.current?.focus());
    },
    [companyByKey],
  );

  function toggleCompany(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function onConfirmLoad() {
    const keys = [...selectedKeys];
    const hasCounts = Object.values(counts).some((c) => c != null);
    if (hasCounts && loadedKeys.length > 0) {
      const ok = window.confirm("Loading will clear current counts. Continue?");
      if (!ok) return;
    }
    void loadCompanies(keys, false);
  }

  function onRefresh() {
    if (loadedKeys.length === 0) {
      notify.error("Load companies first");
      return;
    }
    void loadCompanies(loadedKeys, true);
  }

  function onClearCounts() {
    if (!Object.values(counts).some((c) => c != null)) return;
    const ok = window.confirm("Clear all counts? Stock stays as loaded.");
    if (!ok) return;
    setCounts({});
    setCountDrafts({});
    setHighlightedSku(null);
  }

  function applyScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    if (rows.length === 0) {
      notify.error("Select companies and load items first");
      return;
    }
    const result = matchScan(trimmed, rows);
    if (result.kind === "none") {
      notify.error("Barcode not found in loaded items");
      setBarcode("");
      return;
    }
    if (result.kind === "ambiguous") {
      notify.error("Barcode matches multiple items — type count on the correct row");
      setBarcode("");
      return;
    }
    const skuKey = result.skuKey;
    setCounts((prev) => {
      const cur = prev[skuKey];
      const nextVal = (cur == null ? 0 : cur) + 1;
      return { ...prev, [skuKey]: nextVal };
    });
    setCountDrafts((prev) => {
      const next = { ...prev };
      delete next[skuKey];
      return next;
    });
    setHighlightedSku(skuKey);
    setBarcode("");
    scrollToSku(skuKey, rows);
    if (!countFocusedRef.current) {
      requestAnimationFrame(() => barcodeRef.current?.focus());
    }
  }

  function commitCount(skuKey: string, raw: string) {
    const previous = counts[skuKey] ?? null;
    const parsed = parseCountInput(raw, previous);
    if (raw.trim() !== "" && parsed === previous && !/^\d+$/.test(raw.trim())) {
      notify.error("Count must be a whole number ≥ 0");
      setCountDrafts((d) => ({ ...d, [skuKey]: previous == null ? "" : String(previous) }));
      return;
    }
    setCounts((prev) => ({ ...prev, [skuKey]: parsed }));
    setCountDrafts((d) => {
      const next = { ...d };
      delete next[skuKey];
      return next;
    });
  }

  const visibleStart = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
  const visibleEnd = Math.min(
    rows.length,
    Math.ceil((scrollTop + VIEWPORT_H) / ROW_H) + OVERSCAN,
  );
  const visibleRows = rows.slice(visibleStart, visibleEnd);
  const padTop = visibleStart * ROW_H;
  const padBottom = Math.max(0, (rows.length - visibleEnd) * ROW_H);

  return (
    <div className="space-y-4">
      <div className="max-w-3xl space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Store stock count</h1>
        <p className="text-sm text-muted-foreground">
          Select ERP companies, load live stock, scan barcodes to count. Difference is count minus
          live stock. Does not update ERP.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">ERP companies</h2>
          {companiesLoading ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Loading…
            </span>
          ) : null}
        </div>
        {companies.length === 0 && !companiesLoading ? (
          <p className="text-sm text-muted-foreground">No ERP companies available.</p>
        ) : (
          <ul className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
            {companies.map((c) => {
              const key = toCompanyKey(c);
              return (
                <li key={key}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted/50">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={selectedKeys.has(key)}
                      disabled={busy}
                      onChange={() => toggleCompany(key)}
                    />
                    <span>{companyLabel(c)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || selectedKeys.size === 0} onClick={onConfirmLoad}>
            {busy && loadingLabel ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Loading {loadingLabel}…
              </>
            ) : (
              "Load items"
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || loadedKeys.length === 0}
            onClick={onRefresh}
          >
            <RefreshCw className="size-4" aria-hidden />
            Refresh stock
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !Object.values(counts).some((c) => c != null)}
            onClick={onClearCounts}
          >
            Clear counts
          </Button>
        </div>
        {loadErrors.length > 0 ? (
          <ul className="space-y-1 text-xs text-destructive">
            {loadErrors.map((e) => (
              <li key={`${e.instanceId}::${e.erpCompany}`}>
                {e.erpCompany}: {e.message}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <form
        className="flex max-w-xl flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          applyScan(barcode);
        }}
      >
        <div className="relative min-w-[16rem] flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2 size-4 text-muted-foreground" />
          <Input
            ref={barcodeRef}
            className="pl-8"
            value={barcode}
            placeholder="Scan or type barcode"
            disabled={busy || rows.length === 0}
            autoFocus
            onChange={(e) => setBarcode(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy || rows.length === 0}>
          Count
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Select companies and load items to start counting.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <div className="min-w-[720px]">
            <div
              className="grid gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground"
              style={{
                gridTemplateColumns: `minmax(7rem,1fr) minmax(8rem,1.2fr) minmax(6rem,1fr) repeat(${Math.max(loadedKeys.length, 1)}, minmax(4.5rem,0.7fr)) 5rem 5rem`,
              }}
            >
              <span>SKU</span>
              <span>Name</span>
              <span>Barcode</span>
              {loadedKeys.map((k) => (
                <span key={k} className="text-right">
                  {companyByKey.get(k)?.erpCompany ?? k}
                </span>
              ))}
              <span className="text-right">Count</span>
              <span className="text-right">Diff</span>
            </div>
            <div
              ref={viewportRef}
              className="overflow-y-auto"
              style={{ height: VIEWPORT_H }}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
              <div style={{ height: padTop }} />
              {visibleRows.map((row) => {
                const stockSum = sumLiveStock(row.stockByCompany, loadedKeys);
                const count = counts[row.skuKey] ?? null;
                const diff = difference(count, stockSum);
                const draft = countDrafts[row.skuKey];
                const highlighted = highlightedSku === row.skuKey;
                return (
                  <div
                    key={row.skuKey}
                    data-sku={row.skuKey}
                    className={`grid items-center gap-2 border-b px-3 text-sm ${
                      highlighted ? "bg-amber-100/80 dark:bg-amber-950/40" : ""
                    }`}
                    style={{
                      height: ROW_H,
                      gridTemplateColumns: `minmax(7rem,1fr) minmax(8rem,1.2fr) minmax(6rem,1fr) repeat(${Math.max(loadedKeys.length, 1)}, minmax(4.5rem,0.7fr)) 5rem 5rem`,
                    }}
                  >
                    <span className="truncate font-medium" title={row.sku}>
                      {row.sku}
                    </span>
                    <span className="truncate" title={row.description || row.name}>
                      {row.name}
                    </span>
                    <span className="truncate text-xs text-muted-foreground" title={row.barcodes.join(", ")}>
                      {row.barcodes[0] ?? "—"}
                    </span>
                    {loadedKeys.map((k) => {
                      const v = row.stockByCompany[k];
                      return (
                        <span key={k} className="text-right tabular-nums">
                          {v == null ? "—" : v}
                        </span>
                      );
                    })}
                    <Input
                      className="h-8 text-right tabular-nums"
                      inputMode="numeric"
                      value={draft !== undefined ? draft : count == null ? "" : String(count)}
                      disabled={busy}
                      onFocus={() => {
                        countFocusedRef.current = true;
                      }}
                      onBlur={(e) => {
                        countFocusedRef.current = false;
                        commitCount(row.skuKey, e.target.value);
                        requestAnimationFrame(() => barcodeRef.current?.focus());
                      }}
                      onChange={(e) =>
                        setCountDrafts((d) => ({ ...d, [row.skuKey]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                    />
                    <span
                      className={`text-right tabular-nums ${
                        diff == null
                          ? "text-muted-foreground"
                          : diff < 0
                            ? "text-destructive"
                            : diff > 0
                              ? "text-emerald-700 dark:text-emerald-400"
                              : ""
                      }`}
                    >
                      {diff == null ? "—" : diff > 0 ? `+${diff}` : diff}
                    </span>
                  </div>
                );
              })}
              <div style={{ height: padBottom }} />
            </div>
          </div>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            {rows.length} items
            {Object.values(counts).filter((c) => c != null).length
              ? ` · ${Object.values(counts).filter((c) => c != null).length} counted`
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
