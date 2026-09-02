"use client";

import type { ItemMovementRow } from "@/lib/item-trends/types";
import { PinButton } from "@/components/organisms/item-trends/focus-list";

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
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No movement in this range.</p>
    );
  }

  return (
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
          {rows.map((row) => (
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
  );
}
