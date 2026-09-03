"use client";

import { useCallback } from "react";

import type { ItemMovementRow } from "@/lib/item-trends/types";
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
                {onTogglePin && pinContext ? <th className="px-3 py-2 w-8" /> : null}
              </tr>
            </thead>
            <tbody>
              {paged.slice.map((row) => (
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
