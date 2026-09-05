"use client";

import { useCallback } from "react";
import Link from "next/link";

import type { ItemMovementRow } from "@/lib/item-trends/types";
import { resolveMarketGapBadge } from "@/lib/item-trends/market-gap-badge";
import { PinButton } from "@/components/organisms/item-trends/focus-list";
import { ListPager, usePagedRows } from "@/components/organisms/item-trends/list-pager";

type Props = {
  rows: ItemMovementRow[];
  pinContext?: string;
  isPinned?: (sku: string) => boolean;
  onTogglePin?: (row: ItemMovementRow, context: string) => void;
};

function signalLabel(signal: ItemMovementRow["signal"]) {
  switch (signal) {
    case "fast_mover":
      return "Fast mover";
    case "accelerating":
      return "Accelerating";
    case "stalling":
      return "Stalling";
    case "slowdown":
      return "Slowdown";
    default:
      return "—";
  }
}

function changeArrow(pct: number | null) {
  if (pct == null) return "—";
  if (pct > 0) return `▲ ${pct}%`;
  if (pct < 0) return `▼ ${Math.abs(pct)}%`;
  return "— 0%";
}

export function MovementTable({ rows, pinContext, isPinned, onTogglePin }: Props) {
  const fields = useCallback(
    (row: ItemMovementRow) => [row.sku, row.title, row.priority],
    [],
  );
  const paged = usePagedRows(rows, fields);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No items for this priority.</p>
    );
  }

  return (
    <div>
      <ListPager
        query={paged.query}
        onQueryChange={paged.setQuery}
        page={paged.page}
        pageCount={paged.pageCount}
        total={paged.total}
        from={paged.from}
        to={paged.to}
        onPage={paged.setPage}
        searchPlaceholder="Search SKU or title…"
      />
      {paged.slice.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matching SKUs.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium text-right">Units</th>
                <th className="px-3 py-2 font-medium text-right">Speed/day</th>
                <th className="px-3 py-2 font-medium text-right">vs prior</th>
                <th className="px-3 py-2 font-medium">Signal</th>
                <th className="px-3 py-2 font-medium text-center">Market Gap</th>
                {onTogglePin && pinContext ? <th className="px-3 py-2 w-8" /> : null}
              </tr>
            </thead>
            <tbody>
              {paged.slice.map((row) => {
                const gapBadge = resolveMarketGapBadge(
                  row.marketGapPct,
                  row.isCheapestInMarket,
                );

                return (
                  <tr key={row.sku} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.sku}</div>
                      {row.title ? (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {row.title}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{row.priority}</td>
                    <td className="px-3 py-2 text-right">{row.unitsCurrent}</td>
                    <td className="px-3 py-2 text-right">{row.speedPerDay.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{changeArrow(row.speedChangePct)}</td>
                    <td className="px-3 py-2">{signalLabel(row.signal)}</td>
                    <td className="px-3 py-2 text-center">
                      {gapBadge ? (
                        <Link
                          href={`/dashboard/purchasing/market-prices?q=${encodeURIComponent(row.sku)}`}
                          title="View competitor prices"
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-opacity hover:opacity-80 ${
                            gapBadge.tone === "cheapest"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                              : gapBadge.tone === "above"
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                                : gapBadge.tone === "below"
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                  : "bg-secondary text-secondary-foreground"
                          }`}
                        >
                          {gapBadge.label}
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>
                    {onTogglePin && pinContext ? (
                      <td className="px-3 py-2">
                        <PinButton
                          row={row}
                          context={pinContext}
                          pinned={isPinned?.(row.sku) ?? false}
                          onToggle={onTogglePin}
                        />
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
