"use client";

import { Pin, PinOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { FocusExportRow } from "@/lib/item-trends/export";
import type { ItemMovementRow } from "@/lib/item-trends/types";

type Props = {
  pinned: FocusExportRow[];
  compareRows?: ItemMovementRow[];
  compareLabel?: string;
  onUnpin: (sku: string) => void;
  onExport: () => void;
};

export function FocusListPanel({
  pinned,
  compareRows = [],
  compareLabel,
  onUnpin,
  onExport,
}: Props) {
  const compareMap = new Map(compareRows.map((r) => [r.sku, r]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Focus list ({pinned.length})</span>
        <Button type="button" size="sm" variant="outline" onClick={onExport} disabled={pinned.length === 0}>
          Export CSV
        </Button>
      </div>
      {pinned.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Pin items from movement tables using the pin icon (session only).
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2 text-right">Units</th>
                {compareLabel ? (
                  <th className="px-3 py-2 text-right">{compareLabel}</th>
                ) : null}
                <th className="px-3 py-2">Signal</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {pinned.map((row) => {
                const compare = compareMap.get(row.sku);
                return (
                  <tr key={row.sku} className="border-t">
                    <td className="px-3 py-2 font-medium">{row.sku}</td>
                    <td className="px-3 py-2 text-right">{row.unitsCurrent}</td>
                    {compareLabel ? (
                      <td className="px-3 py-2 text-right">{compare?.unitsCurrent ?? "—"}</td>
                    ) : null}
                    <td className="px-3 py-2 text-xs">{row.signal}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => onUnpin(row.sku)}
                        aria-label={`Unpin ${row.sku}`}
                      >
                        <PinOff className="h-4 w-4" />
                      </button>
                    </td>
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

export function PinButton({
  row,
  context,
  pinned,
  onToggle,
}: {
  row: ItemMovementRow;
  context: string;
  pinned: boolean;
  onToggle: (row: ItemMovementRow, context: string) => void;
}) {
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground"
      onClick={() => onToggle(row, context)}
      aria-label={pinned ? `Unpin ${row.sku}` : `Pin ${row.sku}`}
    >
      <Pin className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
    </button>
  );
}

export { useFocusList } from "@/components/organisms/item-trends/use-focus-list";
