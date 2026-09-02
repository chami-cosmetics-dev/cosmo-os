"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Package, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { OutletBalanceRow, StockPressure, TransferCandidate } from "@/lib/item-trends/types";

type Props = {
  outlets: OutletBalanceRow[];
  transfers: TransferCandidate[];
};

type PressureFilter = "all" | "high_slow" | "low_fast" | "attention";

const PRESSURE_RANK: Record<StockPressure, number> = {
  high_slow: 0,
  low_fast: 1,
  balanced: 2,
};

function sortOutletRows(rows: OutletBalanceRow[]): OutletBalanceRow[] {
  return [...rows].sort((a, b) => {
    const rankDiff = PRESSURE_RANK[a.stockPressure] - PRESSURE_RANK[b.stockPressure];
    if (rankDiff !== 0) return rankDiff;

    if (a.stockPressure === "high_slow") {
      return (b.stockQty ?? 0) - (a.stockQty ?? 0);
    }
    if (a.stockPressure === "low_fast") {
      return b.speedPerDay - a.speedPerDay;
    }

    const skuDiff = a.sku.localeCompare(b.sku);
    if (skuDiff !== 0) return skuDiff;
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
    <article className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold tracking-tight text-foreground">{transfer.sku}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{transfer.message}</p>
        </div>
        {ratioLabel ? (
          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            {ratioLabel}
          </span>
        ) : null}
      </div>

      <div className="flex items-stretch gap-2">
        <MetricBlock
          label={transfer.sourceOutletName}
          stock={transfer.sourceStock}
          speed={transfer.sourceSpeed}
          tone="source"
        />
        <div className="flex shrink-0 items-center self-center text-muted-foreground">
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

export function OutletsPanel({ outlets, transfers }: Props) {
  const [pressureFilter, setPressureFilter] = useState<PressureFilter>("attention");

  const pressureCounts = useMemo(() => {
    let highSlow = 0;
    let lowFast = 0;
    for (const row of outlets) {
      if (row.stockPressure === "high_slow") highSlow += 1;
      if (row.stockPressure === "low_fast") lowFast += 1;
    }
    return { highSlow, lowFast, attention: highSlow + lowFast };
  }, [outlets]);

  const displayOutlets = useMemo(() => {
    const filtered = filterOutletRows(outlets, pressureFilter);
    return sortOutletRows(filtered);
  }, [outlets, pressureFilter]);

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Transfer candidates</h3>
          {transfers.length > 0 ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {transfers.length} suggested
            </span>
          ) : null}
        </div>

        {transfers.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {transfers.map((t) => (
              <TransferCard key={`${t.sku}-${t.sourceColumnKey}-${t.destColumnKey}`} transfer={t} />
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No transfer candidates for this range.
          </p>
        )}
      </section>

      {outlets.length > 0 ? (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Outlet balance</h3>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={pressureFilter === "attention" ? "default" : "outline"}
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
                variant={pressureFilter === "all" ? "default" : "outline"}
                onClick={() => setPressureFilter("all")}
              >
                All ({outlets.length})
              </Button>
            </div>
          </div>

          {displayOutlets.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No rows match this filter.
            </p>
          ) : (
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
                {displayOutlets.map((row) => (
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
          )}
        </section>
      ) : null}
    </div>
  );
}
