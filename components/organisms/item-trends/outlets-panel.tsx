"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Package, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListPager, pageRows, usePagedRows } from "@/components/organisms/item-trends/list-pager";
import type { OutletBalanceRow, StockPressure, TransferCandidate } from "@/lib/item-trends/types";

type Props = {
  outlets: OutletBalanceRow[];
  transfers: TransferCandidate[];
  skuQuery: string;
  onSkuQueryChange: (sku: string) => void;
  salesLoading?: boolean;
  stockLoading?: boolean;
  stockLoaded?: boolean;
  useDateFilter: boolean;
  onUseDateFilterChange: (value: boolean) => void;
  filterFrom: string;
  filterTo: string;
};

type PressureFilter = "all" | "high_slow" | "low_fast" | "attention";

type ItemSaleRow = {
  sku: string;
  totalUnits: number;
  shopCount: number;
  stockShops: number;
  maxSpeed: number;
};

const PRESSURE_RANK: Record<StockPressure, number> = {
  high_slow: 0,
  low_fast: 1,
  balanced: 2,
};

function sortOutletRows(rows: OutletBalanceRow[]): OutletBalanceRow[] {
  return [...rows].sort((a, b) => {
    const unitsDiff = b.unitsInRange - a.unitsInRange;
    if (unitsDiff !== 0) return unitsDiff;
    const rankDiff = PRESSURE_RANK[a.stockPressure] - PRESSURE_RANK[b.stockPressure];
    if (rankDiff !== 0) return rankDiff;
    return a.outletName.localeCompare(b.outletName);
  });
}

function filterOutletRows(rows: OutletBalanceRow[], filter: PressureFilter): OutletBalanceRow[] {
  if (filter === "all") return rows;
  if (filter === "attention") {
    return rows.filter((r) => r.stockPressure === "high_slow" || r.stockPressure === "low_fast");
  }
  return rows.filter((r) => r.stockPressure === filter);
}

function aggregateBySku(rows: OutletBalanceRow[]): ItemSaleRow[] {
  const map = new Map<string, ItemSaleRow>();
  for (const row of rows) {
    const cur = map.get(row.sku) ?? {
      sku: row.sku,
      totalUnits: 0,
      shopCount: 0,
      stockShops: 0,
      maxSpeed: 0,
    };
    cur.totalUnits += row.unitsInRange;
    if (row.unitsInRange > 0) cur.shopCount += 1;
    if ((row.stockQty ?? 0) > 0) cur.stockShops += 1;
    cur.maxSpeed = Math.max(cur.maxSpeed, row.speedPerDay);
    map.set(row.sku, cur);
  }
  return [...map.values()].sort(
    (a, b) => b.totalUnits - a.totalUnits || a.sku.localeCompare(b.sku),
  );
}

function pressureBadge(pressure: StockPressure) {
  const map: Record<StockPressure, { label: string; className: string }> = {
    high_slow: {
      label: "High stock · slow",
      className:
        "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    },
    low_fast: {
      label: "Low stock · fast",
      className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
    },
    balanced: {
      label: "Balanced",
      className: "bg-muted text-muted-foreground",
    },
  };
  const item = map[pressure];
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${item.className}`}>
      {item.label}
    </span>
  );
}

function speedRatio(source: number, dest: number): string | null {
  if (source <= 0 && dest <= 0) return null;
  if (source <= 0) return "Fast at destination";
  const ratio = dest / source;
  if (ratio >= 2) return `${ratio.toFixed(1)}× faster at dest`;
  return null;
}

function MetricBlock({
  label,
  stock,
  speed,
  tone,
}: {
  label: string;
  stock: number;
  speed: number;
  tone: "source" | "dest";
}) {
  const border =
    tone === "source"
      ? "border-amber-500/30 bg-amber-500/5 dark:bg-amber-950/30"
      : "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/30";

  return (
    <div className={`flex-1 rounded-md border px-3 py-2 ${border}`}>
      <div className="truncate text-xs font-medium text-foreground">{label}</div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Package className="h-3 w-3 shrink-0" aria-hidden />
          Stock <span className="font-semibold text-foreground">{stock}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          {speed >= 0.5 ? (
            <TrendingUp className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          ) : (
            <TrendingDown className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          )}
          Speed <span className="font-semibold text-foreground">{speed}/day</span>
        </span>
      </div>
    </div>
  );
}

function TransferCard({ transfer }: { transfer: TransferCandidate }) {
  const ratioLabel = speedRatio(transfer.sourceSpeed, transfer.destSpeed);

  return (
    <article className="rounded-md border border-border bg-card px-3 py-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold tracking-tight text-foreground">{transfer.sku}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{transfer.message}</p>
        </div>
        {ratioLabel ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            {ratioLabel}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <MetricBlock
          label={transfer.sourceOutletName}
          stock={transfer.sourceStock}
          speed={transfer.sourceSpeed}
          tone="source"
        />
        <div className="flex items-center justify-center px-1 text-muted-foreground">
          <ArrowRight className="h-4 w-4" aria-hidden />
        </div>
        <MetricBlock
          label={transfer.destOutletName}
          stock={transfer.destStock}
          speed={transfer.destSpeed}
          tone="dest"
        />
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        Suggestion only — no automatic stock move
      </p>
    </article>
  );
}

export function OutletsPanel({
  outlets,
  transfers,
  skuQuery,
  onSkuQueryChange,
  salesLoading = false,
  stockLoading = false,
  stockLoaded = false,
  useDateFilter,
  onUseDateFilterChange,
  filterFrom,
  filterTo,
}: Props) {
  const [skuDraft, setSkuDraft] = useState(skuQuery);
  const activeSku = skuQuery.trim();

  useEffect(() => {
    setSkuDraft(skuQuery);
  }, [skuQuery]);

  useEffect(() => {
    const next = skuDraft.trim();
    if (next === skuQuery.trim()) return;
    const t = window.setTimeout(() => onSkuQueryChange(skuDraft.trim()), 450);
    return () => window.clearTimeout(t);
  }, [skuDraft, skuQuery, onSkuQueryChange]);

  const itemRows = useMemo(() => aggregateBySku(outlets), [outlets]);
  const itemFields = useCallback((row: ItemSaleRow) => [row.sku], []);
  const pagedItems = usePagedRows(itemRows, itemFields);

  const locationRows = useMemo(() => sortOutletRows(outlets), [outlets]);
  const locationFields = useCallback(
    (row: OutletBalanceRow) => [row.outletName, row.sku],
    [],
  );
  const pagedLocations = usePagedRows(locationRows, locationFields);

  const pressureCounts = useMemo(() => {
    let highSlow = 0;
    let lowFast = 0;
    for (const row of outlets) {
      if (row.stockPressure === "high_slow") highSlow += 1;
      if (row.stockPressure === "low_fast") lowFast += 1;
    }
    return { highSlow, lowFast, attention: highSlow + lowFast };
  }, [outlets]);

  const [pressureFilter, setPressureFilter] = useState<PressureFilter>(() => "attention");
  const effectiveFilter: PressureFilter =
    pressureFilter === "attention" && pressureCounts.attention === 0 && outlets.length > 0
      ? "all"
      : pressureFilter;

  const displayOutlets = useMemo(() => {
    const filtered = filterOutletRows(outlets, effectiveFilter);
    return sortOutletRows(filtered);
  }, [outlets, effectiveFilter]);

  const outletFields = useCallback(
    (row: OutletBalanceRow) => [row.sku, row.outletName],
    [],
  );
  const pagedOutlets = usePagedRows(displayOutlets, outletFields);

  const [transferPage, setTransferPage] = useState(1);
  const pagedTransfers = useMemo(
    () => pageRows(transfers, transferPage, 50),
    [transfers, transferPage],
  );

  const totalUnits = useMemo(
    () => outlets.reduce((sum, row) => sum + row.unitsInRange, 0),
    [outlets],
  );

  const unitsLabel = useDateFilter ? "units in range" : "lifetime units";
  const speedHint = useDateFilter
    ? `Speed = units in ${filterFrom} – ${filterTo} ÷ days`
    : "Speed = lifetime units at that shop ÷ days since first sale there";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <label htmlFor="outlet-sku-search" className="text-xs font-medium text-foreground">
            SKU lookup
          </label>
          <Input
            id="outlet-sku-search"
            value={skuDraft}
            onChange={(e) => setSkuDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSkuQueryChange(skuDraft.trim());
              }
            }}
            placeholder="Type exact SKU — sales at every shop"
            autoComplete="off"
          />
        </div>
        {skuDraft.trim() ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSkuDraft("");
              onSkuQueryChange("");
            }}
          >
            Clear
          </Button>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={useDateFilter ? "outline" : "default"}
            onClick={() => onUseDateFilterChange(false)}
          >
            Lifetime
          </Button>
          <Button
            type="button"
            size="sm"
            variant={useDateFilter ? "default" : "outline"}
            onClick={() => onUseDateFilterChange(true)}
          >
            From/To
          </Button>
        </div>
        <p className="w-full text-xs text-muted-foreground">
          {speedHint}.{" "}
          {activeSku
            ? `Showing ${activeSku} at all shops · ${totalUnits} ${unitsLabel}`
            : `Item-wise shop sales · ${itemRows.length} SKUs · ${totalUnits} ${unitsLabel}`}
          {salesLoading ? " · refreshing…" : null}
          {!activeSku && stockLoading ? " · loading live stock…" : null}
          {!activeSku && stockLoaded && !stockLoading ? " · stock ready" : null}
        </p>
      </div>

      {activeSku ? (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">
            Sales by location
            <span className="ml-2 text-xs font-normal text-muted-foreground">{activeSku}</span>
          </h3>
          {locationRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No shop stock or sales for this SKU
              {useDateFilter ? " in From/To" : " (lifetime)"}. Check spelling (exact SKU).
            </p>
          ) : (
            <div>
              <ListPager
                query={pagedLocations.query}
                onQueryChange={pagedLocations.setQuery}
                page={pagedLocations.page}
                pageCount={pagedLocations.pageCount}
                total={pagedLocations.total}
                from={pagedLocations.from}
                to={pagedLocations.to}
                onPage={pagedLocations.setPage}
                searchPlaceholder="Filter outlet…"
              />
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium text-foreground">Outlet</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">Units</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">Stock</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">Speed/day</th>
                      <th className="px-3 py-2 font-medium text-foreground">Pressure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLocations.slice.map((row) => (
                      <tr key={`${row.sku}-${row.columnKey}`} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{row.outletName}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {row.unitsInRange}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.stockQty ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.speedPerDay.toFixed(2)}
                        </td>
                        <td className="px-3 py-2">{pressureBadge(row.stockPressure)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Item-wise sale count</h3>
          {itemRows.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No shop stock or counter sales for this {useDateFilter ? "From/To + " : "lifetime + "}
              priority. Shop POS SKUs are often Vat / Non Priority — set priority to all. Online
              ignored.
            </p>
          ) : (
            <div>
              <ListPager
                query={pagedItems.query}
                onQueryChange={pagedItems.setQuery}
                page={pagedItems.page}
                pageCount={pagedItems.pageCount}
                total={pagedItems.total}
                from={pagedItems.from}
                to={pagedItems.to}
                onPage={pagedItems.setPage}
                searchPlaceholder="Filter SKU…"
              />
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium text-foreground">SKU</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">Units</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">Shops sold</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">
                        Shops w/ stock
                      </th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">
                        Peak speed/day
                      </th>
                      <th className="px-3 py-2 font-medium text-foreground" />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedItems.slice.map((row) => (
                      <tr key={row.sku} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{row.sku}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {row.totalUnits}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.shopCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {stockLoaded ? row.stockShops : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.maxSpeed.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setSkuDraft(row.sku);
                              onSkuQueryChange(row.sku);
                            }}
                          >
                            All shops
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">
            Transfer candidates
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {useDateFilter ? `${filterFrom} – ${filterTo}` : "lifetime speed"}
            </span>
          </h3>
          {transfers.length > 0 ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {transfers.length} suggested
            </span>
          ) : null}
        </div>

        {transfers.length > 0 ? (
          <div>
            <ListPager
              query=""
              onQueryChange={() => undefined}
              page={pagedTransfers.page}
              pageCount={pagedTransfers.pageCount}
              total={pagedTransfers.total}
              from={pagedTransfers.from}
              to={pagedTransfers.to}
              onPage={setTransferPage}
              hideSearch
            />
            <div className="grid gap-3 lg:grid-cols-2">
              {pagedTransfers.slice.map((t) => (
                <TransferCard
                  key={`${t.sku}-${t.sourceColumnKey}-${t.destColumnKey}`}
                  transfer={t}
                />
              ))}
            </div>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            {stockLoading
              ? "Loading live stock for transfer suggestions…"
              : outlets.length > 0
                ? `No move pairs yet among ${outlets.length} shop rows. Need same SKU with stock ≥5 + slow (<0.5/day) at one shop and faster counter sales at another.`
                : `No transfer candidates — shop balance empty for this ${useDateFilter ? "range" : "lifetime"}/priority first.`}
          </p>
        )}
      </section>

      {!activeSku && outlets.length > 0 ? (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Outlet balance detail
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {outlets.length} shop rows
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={effectiveFilter === "attention" ? "default" : "outline"}
                onClick={() => setPressureFilter("attention")}
              >
                Needs attention ({pressureCounts.attention})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={pressureFilter === "high_slow" ? "default" : "outline"}
                onClick={() => setPressureFilter("high_slow")}
              >
                High stock · slow ({pressureCounts.highSlow})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={pressureFilter === "low_fast" ? "default" : "outline"}
                onClick={() => setPressureFilter("low_fast")}
              >
                Low stock · fast ({pressureCounts.lowFast})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={effectiveFilter === "all" ? "default" : "outline"}
                onClick={() => setPressureFilter("all")}
              >
                All ({outlets.length})
              </Button>
            </div>
          </div>

          {displayOutlets.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No rows match this filter — try All.
            </p>
          ) : (
            <div>
              <ListPager
                query={pagedOutlets.query}
                onQueryChange={pagedOutlets.setQuery}
                page={pagedOutlets.page}
                pageCount={pagedOutlets.pageCount}
                total={pagedOutlets.total}
                from={pagedOutlets.from}
                to={pagedOutlets.to}
                onPage={pagedOutlets.setPage}
                searchPlaceholder="Search SKU or outlet…"
              />
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium text-foreground">SKU</th>
                      <th className="px-3 py-2 font-medium text-foreground">Outlet</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">Stock</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">Units</th>
                      <th className="px-3 py-2 text-right font-medium text-foreground">Speed/day</th>
                      <th className="px-3 py-2 font-medium text-foreground">Pressure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedOutlets.slice.map((row) => (
                      <tr key={`${row.sku}-${row.columnKey}`} className="border-t border-border">
                        <td className="px-3 py-2 font-medium text-foreground">{row.sku}</td>
                        <td className="px-3 py-2 text-foreground">{row.outletName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.stockQty ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.unitsInRange}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {row.speedPerDay.toFixed(2)}
                        </td>
                        <td className="px-3 py-2">{pressureBadge(row.stockPressure)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
