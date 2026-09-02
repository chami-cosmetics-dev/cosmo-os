"use client";

import type { ExpansionOpportunityRow } from "@/lib/item-trends/types";

type Props = {
  rows: ExpansionOpportunityRow[];
};

export function ExpansionPanel({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No expansion opportunities for this range.</p>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">Expansion opportunities</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.district} className="rounded-md border px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{row.district}</span>
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium">
                Score {row.score}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Delivery {row.deliveryUnits} units · Shop {row.shopUnits} units
              {row.growthPct != null ? ` · ${row.growthPct}% growth` : ""}
            </div>
            {row.nearestStore ? (
              <div className="mt-1 text-xs">Nearest physical shop: {row.nearestStore}</div>
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">
                No physical shop mapped in this district
              </div>
            )}
            <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
              {row.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {row.topSkus.length > 0 ? (
              <div className="mt-2 text-xs">
                Top SKUs: {row.topSkus.join(", ")}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
