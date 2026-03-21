"use client";

import { useMemo } from "react";

import { Card, CardContent } from "@/components/ui/card";

type BaseRow = { label: string; value: number; count: number };

interface DashboardSalesChartsProps {
  stats: Array<{
    shop: string;
    total: string;
    invoiceCount?: number;
  }>;
}

export function DashboardSalesCharts({ stats }: DashboardSalesChartsProps) {
  const rows = useMemo(() => {
    return stats.slice(0, 10).map((item) => {
      const value = parseMetric(item.total);
      const count = item.invoiceCount ?? Math.max(1, Math.round(value / 10000));
      return { label: item.shop, value, count };
    });
  }, [stats]);

  return (
    <div className="space-y-4">
      <DashboardSalesComparisonChart rows={rows} />
    </div>
  );
}

function DashboardSalesComparisonChart({ rows }: { rows: BaseRow[] }) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
  const topRow = rows[0] ?? null;

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Invoice Value vs Count</h3>
            <p className="text-muted-foreground text-sm">Enhanced quick-read comparison by shop</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-border bg-background px-3 py-1">
              Total Value: {formatWithSpaces(totalValue)}
            </span>
            <span className="rounded-full border border-border bg-background px-3 py-1">
              Total Count: {totalCount}
            </span>
            {topRow && (
              <span className="rounded-full border border-border bg-background px-3 py-1">
                Top Shop: {topRow.label}
              </span>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No data to visualize.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const width = Math.max(4, (row.value / maxValue) * 100);
              return (
                <div key={row.label} className="rounded-md border border-border/60 bg-background p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{row.label}</p>
                    <p className="text-muted-foreground text-xs">{row.count} invoices</p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-[#70a8d8] transition-all" style={{ width: `${width}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Invoice Value</span>
                    <span className="font-semibold">{formatWithSpaces(row.value)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function parseMetric(value: string) {
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatWithSpaces(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value).replace(/\u202f/g, " ");
}
