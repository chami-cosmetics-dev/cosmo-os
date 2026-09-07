"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import type { ItemMovementRow } from "@/lib/item-trends/types";
import { resolveMarketGapBadge } from "@/lib/item-trends/market-gap-badge";
import { PinButton } from "@/components/organisms/item-trends/focus-list";
import { ListPager, usePagedRows } from "@/components/organisms/item-trends/list-pager";
import {
  childrenForCommonSku,
  groupRowsByCommonSku,
  type SkuGrain,
} from "@/lib/item-trends/sku-group";

type Props = {
  rows: ItemMovementRow[];
  grain?: SkuGrain;
  pinContext?: string;
  isPinned?: (sku: string) => boolean;
  onTogglePin?: (row: ItemMovementRow, context: string) => void;
  onCompareLocations?: (sku: string, commonSkuKey: string | null) => void;
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

export function MovementTable({
  rows,
  grain = "variant",
  pinContext,
  isPinned,
  onTogglePin,
  onCompareLocations,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const displayRows = useMemo(() => {
    if (grain !== "common") return rows.map((r) => ({ ...r, childCount: 1 }));
    return groupRowsByCommonSku(rows);
  }, [grain, rows]);
  const fields = useCallback(
    (row: ItemMovementRow) => [row.sku, row.title, row.priority, row.brand, row.commonSkuTitle],
    [],
  );
  const paged = usePagedRows(displayRows, fields);

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
                <th className="px-3 py-2 font-medium">Brand</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium text-right">Units</th>
                <th className="px-3 py-2 font-medium text-right">Speed/day</th>
                <th className="px-3 py-2 font-medium text-right">vs prior</th>
                <th className="px-3 py-2 font-medium">Signal</th>
                <th className="px-3 py-2 font-medium text-center">Market Gap</th>
                {onTogglePin && pinContext ? <th className="px-3 py-2 w-8" /> : null}
                {onCompareLocations ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {paged.slice.map((row) => {
                const gapBadge = resolveMarketGapBadge(
                  row.marketGapPct,
                  row.isCheapestInMarket,
                );
                const grouped = grain === "common";
                const open = openKey === (row.commonSkuKey ?? row.sku);
                const children =
                  grouped && open ? childrenForCommonSku(rows, row.commonSkuKey ?? row.sku) : [];

                return (
                  <Fragment key={row.sku}>
                    <tr className="border-t">
                    <td className="px-3 py-2">
                      {grouped && (row.childCount ?? 1) > 1 ? (
                        <button
                          type="button"
                          className="text-left font-medium underline-offset-2 hover:underline"
                          onClick={() =>
                            setOpenKey(open ? null : (row.commonSkuKey ?? row.sku))
                          }
                        >
                          {row.commonSkuTitle ?? row.title ?? row.sku}{" "}
                          <span className="text-xs text-muted-foreground">({row.childCount} SKUs)</span>
                        </button>
                      ) : (
                        <>
                          <div className="font-medium">{row.sku}</div>
                          {row.title ? (
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {row.title}
                              {row.variantTitle ? ` · ${row.variantTitle}` : ""}
                            </div>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2">{row.brand ?? "—"}</td>
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
                    {onCompareLocations ? (
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onCompareLocations(row.sku, row.commonSkuKey ?? null)}
                        >
                          Compare
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                  {children.map((child) => (
                    <tr key={child.sku} className="border-t bg-muted/20">
                      <td className="px-3 py-2 pl-8">
                        <div className="font-medium">{child.sku}</div>
                        <div className="text-xs text-muted-foreground">
                          {child.variantTitle ?? child.title}
                        </div>
                      </td>
                      <td className="px-3 py-2">{child.brand ?? "—"}</td>
                      <td className="px-3 py-2">{child.priority}</td>
                      <td className="px-3 py-2 text-right">{child.unitsCurrent}</td>
                      <td className="px-3 py-2 text-right">{child.speedPerDay.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right">{changeArrow(child.speedChangePct)}</td>
                      <td className="px-3 py-2">{signalLabel(child.signal)}</td>
                      <td className="px-3 py-2" />
                      {onTogglePin && pinContext ? <td className="px-3 py-2" /> : null}
                      {onCompareLocations ? (
                        <td className="px-3 py-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onCompareLocations(child.sku, child.commonSkuKey ?? null)}
                          >
                            Compare
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
