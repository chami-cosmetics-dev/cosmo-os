"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  availableCompareLocations,
  compareCoverByLocation,
} from "@/lib/item-trends/location-compare";
import type { CoverRow } from "@/lib/item-trends/types";

type Props = {
  itemLabel: string;
  rows: CoverRow[];
  onClose?: () => void;
};

function pct(n: number | null) {
  if (n == null) return "—";
  return `${n.toFixed(0)}%`;
}

export function LocationComparePanel({ itemLabel, rows, onClose }: Props) {
  const locations = useMemo(() => availableCompareLocations(rows), [rows]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    setPicked(locations.map((l) => l.columnKey));
  }, [locations]);

  const compared = useMemo(
    () => compareCoverByLocation({ rows, selectedColumnKeys: picked }),
    [rows, picked],
  );

  function toggle(columnKey: string) {
    setPicked((current) =>
      current.includes(columnKey) ? current.filter((k) => k !== columnKey) : [...current, columnKey],
    );
  }

  const totals = compared.reduce(
    (acc, row) => ({
      units: acc.units + row.unitsInRange,
      stock: acc.stock + row.stockQty,
      send: acc.send + row.suggestedSendQty,
    }),
    { units: 0, stock: 0, send: 0 },
  );

  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{itemLabel} — warehouses</p>
          <p className="text-xs text-muted-foreground">
            Tick locations. Untick to drop. Online / Main first.
          </p>
        </div>
        {onClose ? (
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Clear item
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(locations.map((l) => l.columnKey))}>
          All
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setPicked([])}>
          None
        </Button>
        {locations.map((loc) => (
          <label
            key={loc.columnKey}
            className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
          >
            <input
              type="checkbox"
              checked={picked.includes(loc.columnKey)}
              onChange={() => toggle(loc.columnKey)}
            />
            <span className="text-muted-foreground">{loc.channelKind === "online" ? "Online" : "Shop"}</span>
            {loc.label}
          </label>
        ))}
      </div>

      {compared.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pick at least one location.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">Location</th>
                <th className="px-3 py-2 text-right">Sale</th>
                <th className="px-3 py-2 text-right">Stock</th>
                <th className="px-3 py-2 text-right">Stock/sale</th>
                <th className="px-3 py-2 text-right">Week need</th>
                <th className="px-3 py-2 text-right">Cover days</th>
                <th className="px-3 py-2">Send</th>
              </tr>
            </thead>
            <tbody>
              {compared.map((row) => (
                <tr key={row.columnKey} className="border-t">
                  <td className="px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {row.channelKind === "online" ? "Online" : "Shop"}
                    </span>{" "}
                    {row.outletName}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.unitsInRange}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.stockQty}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{pct(row.stockPctOfSale)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.weekNeed}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.coverDays == null ? "—" : row.coverDays}
                  </td>
                  <td className="px-3 py-2">
                    {row.shouldSend ? (
                      <span className="font-medium text-amber-700 dark:text-amber-300">
                        Send {row.suggestedSendQty}
                      </span>
                    ) : row.isOosInRange ? (
                      <span className="text-rose-700 dark:text-rose-300">OOS</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/40 font-medium">
                <td className="px-3 py-2">Selected total</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.units}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.stock}</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2 text-right">—</td>
                <td className="px-3 py-2">{totals.send > 0 ? `Send ${totals.send}` : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
