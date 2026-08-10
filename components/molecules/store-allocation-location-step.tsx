"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WalkthroughStep } from "@/lib/store-allocation/session-types";

type Props = {
  step: WalkthroughStep;
  onPrev: () => void;
  onNext: () => void;
  onQtyChange: (sku: string, raw: string) => void;
  canPrev: boolean;
  canNext: boolean;
};

export function StoreAllocationLocationStep({
  step,
  onPrev,
  onNext,
  onQtyChange,
  canPrev,
  canNext,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            Location {step.index + 1} of {step.total}
          </p>
          <h2 className="text-lg font-semibold tracking-tight">{step.label}</h2>
          <p className="text-sm text-muted-foreground">
            Items for this location with ROP, stock, need, and sales. Use ← → when not editing.
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button type="button" size="icon" variant="outline" disabled={!canPrev} onClick={onPrev}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" disabled={!canNext} onClick={onNext}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">SKU</th>
              <th className="p-2">Description</th>
              <th className="p-2">ROP</th>
              <th className="p-2">Stock</th>
              <th className="p-2">Need</th>
              <th className="p-2">Sales 90d</th>
              <th className="p-2">Suggested</th>
              <th className="p-2">Qty</th>
            </tr>
          </thead>
          <tbody>
            {step.lines.map((line) => (
              <tr key={line.sku} className="border-t">
                <td className="p-2 font-medium whitespace-nowrap">{line.sku}</td>
                <td className="p-2 text-muted-foreground max-w-[12rem]">
                  <span className="line-clamp-2">{line.description || "—"}</span>
                </td>
                <td className="p-2 tabular-nums">{line.locationRop}</td>
                <td className="p-2 tabular-nums">{line.stock}</td>
                <td className="p-2 tabular-nums">{line.need}</td>
                <td className="p-2 tabular-nums">{line.sales90d}</td>
                <td className="p-2 tabular-nums">{line.suggestedQty}</td>
                <td className="p-2">
                  <Input
                    className="h-8 w-20"
                    type="number"
                    min={0}
                    value={line.qty || ""}
                    onChange={(e) => onQtyChange(line.sku, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
