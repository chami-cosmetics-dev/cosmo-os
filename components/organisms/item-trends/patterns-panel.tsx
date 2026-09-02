"use client";

import type { PatternAnnotation } from "@/lib/item-trends/types";

type Props = {
  patterns: PatternAnnotation[];
  available: boolean;
};

export function PatternsPanel({ patterns, available }: Props) {
  if (!available) {
    return (
      <p className="text-sm text-muted-foreground">
        Weekday patterns need a range of at least 28 days.
      </p>
    );
  }

  if (patterns.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No recurring weekday spikes detected.</p>
    );
  }

  return (
    <div className="space-y-2">
      {patterns.map((row) => (
        <div key={row.sku} className="rounded-md border px-3 py-2 text-sm">
          <div className="font-medium">{row.sku}</div>
          <div className="text-xs text-muted-foreground">
            Spikes on {row.dominantDayLabels.join(", ")}
            {row.recurring ? " · recurring" : " · one-off"}
          </div>
        </div>
      ))}
    </div>
  );
}
