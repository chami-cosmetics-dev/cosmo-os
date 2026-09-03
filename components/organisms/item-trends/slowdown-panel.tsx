"use client";

import { useCallback } from "react";

import type { ItemMovementRow } from "@/lib/item-trends/types";
import { ListPager, usePagedRows } from "@/components/organisms/item-trends/list-pager";

type Props = {
  rows: ItemMovementRow[];
};

function severityClass(row: ItemMovementRow): string {
  const drop = row.speedChangePct;
  if (drop != null && drop <= -40) {
    return "border-red-500/40 bg-red-500/10 dark:bg-red-950/30";
  }
  if (drop != null && drop <= -25) {
    return "border-amber-500/40 bg-amber-500/10 dark:bg-amber-950/30";
  }
  return "border-border bg-card";
}

export function SlowdownPanel({ rows }: Props) {
  const fields = useCallback((row: ItemMovementRow) => [row.sku, row.title], []);
  const paged = usePagedRows(rows, fields, 50);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Top Priority slowdowns in this range.
      </p>
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
      />
      <div className="space-y-2">
        {paged.slice.map((row) => (
          <div
            key={row.sku}
            className={`rounded-md border px-3 py-2 text-sm ${severityClass(row)}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{row.sku}</span>
              <span className="text-xs text-muted-foreground">
                {row.unitsPrior} → {row.unitsCurrent} units
                {row.speedChangePct != null ? ` (${row.speedChangePct}%)` : ""}
              </span>
            </div>
            {row.title ? (
              <div className="truncate text-xs text-muted-foreground">{row.title}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
