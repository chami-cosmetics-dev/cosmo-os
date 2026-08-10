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
            Qtys for this location across scanned items. Use ← → when not editing a field.
          </p>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="icon" variant="outline" disabled={!canPrev} onClick={onPrev}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button type="button" size="icon" variant="outline" disabled={!canNext} onClick={onNext}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">SKU</th>
              <th className="p-2">Description</th>
              <th className="p-2">Qty</th>
            </tr>
          </thead>
          <tbody>
            {step.lines.map((line) => (
              <tr key={line.sku} className="border-t">
                <td className="p-2 font-medium">{line.sku}</td>
                <td className="p-2 text-muted-foreground line-clamp-2">{line.description || "—"}</td>
                <td className="p-2">
                  <Input
                    className="h-8 w-24"
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
