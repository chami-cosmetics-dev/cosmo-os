"use client";

import type { ItemMovementRow } from "@/lib/item-trends/types";

type Props = {
  rows: ItemMovementRow[];
};

export function NewItemsPanel({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No Newly Added items with movement.</p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.sku}
          className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
        >
          <div>
            <span className="font-medium">{row.sku}</span>
            <span className="ml-2 text-muted-foreground">{row.unitsCurrent} units</span>
          </div>
          <span
            className={
              row.signal === "accelerating" ?
                "rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
              : row.signal === "stalling" ?
                "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
              : "text-xs text-muted-foreground"
            }
          >
            {row.signal === "accelerating" ? "Accelerating" : row.signal === "stalling" ? "Stalling" : "Watching"}
          </span>
        </div>
      ))}
    </div>
  );
}
