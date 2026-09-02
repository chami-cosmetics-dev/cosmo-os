"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import type { RopSuggestionRow } from "@/lib/item-trends/types";

type Props = {
  rows: RopSuggestionRow[];
  windowLabel: string;
  ropWindow: "3m" | "2m" | "custom";
  onWindowChange: (w: "3m" | "2m" | "custom") => void;
  canManageRop: boolean;
  onRefresh: () => void;
};

function overlayBadge(overlay: RopSuggestionRow["overlay"]) {
  if (overlay === "increase") return "Increase";
  if (overlay === "decrease") return "Decrease";
  return "Hold";
}

export function RopPanel({
  rows,
  windowLabel,
  ropWindow,
  onWindowChange,
  canManageRop,
  onRefresh,
}: Props) {
  const [busySku, setBusySku] = useState<string | null>(null);

  async function applyRop(row: RopSuggestionRow) {
    if (!canManageRop) return;
    setBusySku(row.sku);
    try {
      const res = await fetch(`/api/admin/osf/profiles/${encodeURIComponent(row.sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rops: { [row.columnKey]: row.suggestedRop } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to save ROP");
        return;
      }
      notify.success(`ROP updated for ${row.sku}`);
      onRefresh();
    } catch {
      notify.error("Failed to save ROP");
    } finally {
      setBusySku(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Window: {windowLabel}</span>
        <Button
          type="button"
          size="sm"
          variant={ropWindow === "3m" ? "default" : "outline"}
          onClick={() => onWindowChange("3m")}
        >
          3 months
        </Button>
        <Button
          type="button"
          size="sm"
          variant={ropWindow === "2m" ? "default" : "outline"}
          onClick={() => onWindowChange("2m")}
        >
          2 months
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No ROP suggestions.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2 text-right">Window sales</th>
                <th className="px-3 py-2 text-right">Current ROP</th>
                <th className="px-3 py-2 text-right">Suggested ×2</th>
                <th className="px-3 py-2">Overlay</th>
                {canManageRop ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sku} className="border-t">
                  <td className="px-3 py-2 font-medium">{row.sku}</td>
                  <td className="px-3 py-2">{row.priority}</td>
                  <td className="px-3 py-2 text-right">{row.windowSales}</td>
                  <td className="px-3 py-2 text-right">{row.currentRop ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-medium">{row.suggestedRop}</td>
                  <td className="px-3 py-2">{overlayBadge(row.overlay)}</td>
                  {canManageRop ? (
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busySku !== null}
                        onClick={() => void applyRop(row)}
                      >
                        {busySku === row.sku ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                            Saving
                          </>
                        ) : (
                          "Apply"
                        )}
                      </Button>
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
