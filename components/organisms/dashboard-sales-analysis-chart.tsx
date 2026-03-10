"use client";

import { useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";

type ChartType = "column" | "area" | "line" | "bar" | "spline";

interface DashboardSalesAnalysisChartProps {
  stats: Array<{
    shop: string;
    total: string;
    invoiceCount?: number;
  }>;
  dateType: "order" | "completed";
}

const CHART_TYPES: Array<{ key: ChartType; label: string }> = [
  { key: "column", label: "Column" },
  { key: "area", label: "Area" },
  { key: "line", label: "Line" },
  { key: "bar", label: "Bar" },
  { key: "spline", label: "Spline" },
];

export function DashboardSalesAnalysisChart({
  stats,
  dateType,
}: DashboardSalesAnalysisChartProps) {
  const [chartType, setChartType] = useState<ChartType>("column");

  const rows = useMemo(() => {
    return stats.slice(0, 10).map((item) => {
      const value = parseMetric(item.total);
      const count = item.invoiceCount ?? Math.max(1, Math.round(value / 10000));
      return { label: item.shop, value, count };
    });
  }, [stats]);

  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {CHART_TYPES.map((type) => (
            <label key={type.key} className="inline-flex items-center gap-2 font-medium">
              <input
                type="radio"
                name="chartType"
                checked={chartType === type.key}
                onChange={() => setChartType(type.key)}
              />
              {type.label}
            </label>
          ))}
        </div>

        <div className="rounded-sm border border-border/70 bg-background px-4 py-5">
          <h3 className="text-center text-3xl font-semibold tracking-tight">
            Retail Sales Analysis by Shop
          </h3>
          <p className="text-muted-foreground mt-1 text-center text-sm">
            Sales Trends - (Based on {dateType === "order" ? "Order Date" : "Completed Date"})
          </p>

          {rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">No data to visualize.</p>
          ) : chartType === "bar" ? (
            <HorizontalBars rows={rows} maxValue={maxValue} />
          ) : chartType === "line" || chartType === "area" || chartType === "spline" ? (
            <LineChart
              rows={rows}
              maxValue={maxValue}
              mode={chartType}
            />
          ) : (
            <VerticalColumns rows={rows} maxValue={maxValue} maxCount={maxCount} />
          )}

          <div className="mt-4 flex justify-center gap-7 text-sm font-semibold">
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-sm bg-[#70a8d8]" />
              INVOICE VALUE
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 rounded-sm bg-[#33353b]" />
              INVOICE COUNT
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VerticalColumns({
  rows,
  maxValue,
  maxCount,
}: {
  rows: Array<{ label: string; value: number; count: number }>;
  maxValue: number;
  maxCount: number;
}) {
  return (
    <div className="mt-5">
      <div className="flex h-72 items-end gap-3 overflow-x-auto border-b border-border/70 px-2 pb-2">
        {rows.map((row) => {
          const valueHeight = `${Math.max(8, (row.value / maxValue) * 100)}%`;
          const countHeight = `${Math.max(8, (row.count / maxCount) * 16)}%`;
          return (
            <div key={row.label} className="flex min-w-[86px] flex-col items-center gap-1">
              <p className="text-sm font-bold">{formatCompact(row.value)}</p>
              <div className="relative flex h-52 w-full items-end justify-center gap-1">
                <div className="w-7 rounded-t-sm bg-[#70a8d8]" style={{ height: valueHeight }} />
                <div className="w-4 rounded-t-sm bg-[#33353b]" style={{ height: countHeight }} />
              </div>
              <p className="line-clamp-2 text-center text-xs leading-tight">{row.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HorizontalBars({
  rows,
  maxValue,
}: {
  rows: Array<{ label: string; value: number; count: number }>;
  maxValue: number;
}) {
  return (
    <div className="mt-5 space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[180px_1fr_56px] items-center gap-2">
          <p className="truncate text-xs">{row.label}</p>
          <div className="h-5 rounded-sm bg-muted">
            <div
              className="h-full rounded-sm bg-[#70a8d8]"
              style={{ width: `${Math.max(3, (row.value / maxValue) * 100)}%` }}
            />
          </div>
          <p className="text-right text-xs font-semibold">{formatCompact(row.value)}</p>
        </div>
      ))}
    </div>
  );
}

function LineChart({
  rows,
  maxValue,
  mode,
}: {
  rows: Array<{ label: string; value: number; count: number }>;
  maxValue: number;
  mode: "line" | "area" | "spline";
}) {
  const width = 960;
  const height = 300;
  const left = 40;
  const bottom = 32;
  const chartWidth = width - left - 20;
  const chartHeight = height - 20 - bottom;

  const points = rows.map((row, index) => {
    const x = left + (chartWidth / Math.max(1, rows.length - 1)) * index;
    const y = 20 + chartHeight - (row.value / maxValue) * chartHeight;
    return { x, y };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const areaPath = `${polyline} ${left + chartWidth},${20 + chartHeight} ${left},${20 + chartHeight}`;

  return (
    <div className="mt-5 overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[780px]">
        {[0, 1, 2, 3, 4].map((i) => {
          const y = 20 + (chartHeight / 4) * i;
          return <line key={i} x1={left} y1={y} x2={left + chartWidth} y2={y} stroke="hsl(var(--border))" />;
        })}

        {mode === "area" && (
          <polygon points={areaPath} fill="#70a8d8" fillOpacity="0.25" />
        )}
        <polyline
          points={polyline}
          fill="none"
          stroke="#70a8d8"
          strokeWidth={mode === "spline" ? 4 : 3}
          strokeLinejoin={mode === "spline" ? "round" : "miter"}
          strokeLinecap={mode === "spline" ? "round" : "butt"}
        />

        {points.map((point, index) => (
          <g key={rows[index]!.label}>
            <circle cx={point.x} cy={point.y} r="4" fill="#70a8d8" />
            <text x={point.x} y={point.y - 8} textAnchor="middle" fontSize="12" fontWeight="700">
              {formatCompact(rows[index]!.value)}
            </text>
            <text
              x={point.x}
              y={height - 10}
              textAnchor="middle"
              fontSize="11"
              fill="hsl(var(--muted-foreground))"
            >
              {shortLabel(rows[index]!.label)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function parseMetric(value: string) {
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function shortLabel(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 12)}...`;
}
