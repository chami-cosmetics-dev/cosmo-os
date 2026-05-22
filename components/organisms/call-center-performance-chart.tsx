"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type PerformanceRow = {
  merchantName: string;
  category: string;
  count: number;
};

type ChartType = "column" | "bar" | "line" | "area" | "spline";

type ChartRow = {
  merchant: string;
  [category: string]: string | number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "#6366f1", // indigo  – Interested
  "#22c55e", // green   – N/A
  "#f97316", // orange  – Not Responding
  "#ef4444", // red     – Not Interested
  "#a855f7", // purple  – Wrong Number
  "#ec4899", // pink    – Black List
  "#eab308", // yellow  – Busy
  "#14b8a6", // teal    – Interested-SMS
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#d946ef", // fuchsia
  "#84cc16", // lime
];

const CHART_TYPE_OPTIONS: { label: string; value: ChartType }[] = [
  { label: "Column", value: "column" },
  { label: "Area",   value: "area" },
  { label: "Line",   value: "line" },
  { label: "Bar",    value: "bar" },
  { label: "Spline", value: "spline" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function CustomLegend({
  payload,
  hidden,
  onToggle,
  colorMap,
}: {
  payload?: Array<{ dataKey?: unknown; color?: string; value?: unknown }>;
  hidden: Set<string>;
  onToggle: (key: string) => void;
  colorMap: Map<string, string>;
}) {
  if (!payload?.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
      {payload.map((item) => {
        const key = String(item.dataKey ?? "");
        const label = String(item.value ?? key);
        const color = colorMap.get(key) ?? item.color ?? "#888";
        const isHidden = hidden.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-xs transition-colors",
              "hover:bg-muted/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              isHidden
                ? "text-muted-foreground line-through opacity-50"
                : "text-foreground",
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: color }}
              aria-hidden
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + Number(p.value ?? 0), 0);
  return (
    <div className="rounded-lg border border-border bg-background p-3 text-sm shadow-md">
      <p className="mb-1 font-semibold">{label}</p>
      {payload
        .filter((p) => Number(p.value ?? 0) > 0)
        .map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
              style={{ backgroundColor: p.color ?? "#888" }}
            />
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium tabular-nums">
              {formatCompact(Number(p.value ?? 0))}
            </span>
          </div>
        ))}
      <div className="mt-1 border-t border-border pt-1 font-semibold">
        Total: {formatCompact(total)}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CallCenterPerformanceChart({
  fromDate,
  toDate,
}: {
  fromDate?: string;
  toDate?: string;
}) {
  const [rows, setRows] = useState<PerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartType, setChartType] = useState<ChartType>("column");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);
    const query = params.toString();

    fetch(`/api/admin/contacts/allocation/performance${query ? `?${query}` : ""}`)
      .then(async (res) => {
        const json = (await res.json()) as { data?: PerformanceRow[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load data");
        if (!cancelled) setRows(json.data ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate]);

  // Derive sorted unique categories and merchants from the raw rows
  const { categories, merchants, colorMap, chartData } = useMemo(() => {
    const catSet = new Set<string>();
    const merchantSet = new Set<string>();

    for (const row of rows) {
      catSet.add(row.category);
      merchantSet.add(row.merchantName);
    }

    const cats = Array.from(catSet);
    const mercs = Array.from(merchantSet);
    const cMap = new Map<string, string>(
      cats.map((cat, i) => [cat, CHART_COLORS[i % CHART_COLORS.length]])
    );

    // Build one row per merchant with a key per category
    const data: ChartRow[] = mercs.map((merchant) => {
      const row: ChartRow = { merchant };
      for (const cat of cats) {
        row[cat] = 0;
      }
      for (const r of rows) {
        if (r.merchantName === merchant) {
          row[r.category] = r.count;
        }
      }
      return row;
    });

    return { categories: cats, merchants: mercs, colorMap: cMap, chartData: data };
  }, [rows]);

  const toggleHidden = useCallback((key: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const visibleCategories = categories.filter((c) => !hidden.has(c));

  // Shared axis / grid props
  const gridProps = { strokeDasharray: "3 3", stroke: "hsl(var(--border))" } as const;
  const xAxisProps = {
    dataKey: "merchant",
    tick: { fontSize: 11 },
    interval: 0,
    angle: merchants.length > 5 ? -25 : 0,
    textAnchor: merchants.length > 5 ? ("end" as const) : ("middle" as const),
    height: merchants.length > 5 ? 60 : 30,
  } as const;
  const yAxisProps = { tick: { fontSize: 11 }, width: 36 } as const;

  function renderSeries(cat: string) {
    const color = colorMap.get(cat) ?? "#888";
    const isHorizontal = chartType === "bar";

    if (chartType === "column") {
      return (
        <Bar key={cat} dataKey={cat} name={cat} fill={color} stackId={undefined} maxBarSize={28}>
          <LabelList
            dataKey={cat}
            position="top"
            style={{ fontSize: 11, fontWeight: 700, fill: color }}
            formatter={(v: number) => (v > 0 ? String(v) : "")}
          />
        </Bar>
      );
    }
    if (chartType === "bar") {
      return (
        <Bar key={cat} dataKey={cat} name={cat} fill={color} maxBarSize={20}>
          <LabelList
            dataKey={cat}
            position="right"
            style={{ fontSize: 11, fontWeight: 700, fill: color }}
            formatter={(v: number) => (v > 0 ? String(v) : "")}
          />
        </Bar>
      );
    }
    if (chartType === "line" || chartType === "spline") {
      return (
        <Line
          key={cat}
          type={chartType === "spline" ? "monotone" : "linear"}
          dataKey={cat}
          name={cat}
          stroke={color}
          dot={{ r: 3, fill: color }}
          strokeWidth={2}
        />
      );
    }
    if (chartType === "area") {
      return (
        <Area
          key={cat}
          type="monotone"
          dataKey={cat}
          name={cat}
          stroke={color}
          fill={color}
          fillOpacity={0.25}
          strokeWidth={2}
        />
      );
    }
    return null;
  }

  function renderChart() {
    const commonProps = {
      data: chartData,
      margin: { top: 18, right: 16, left: 0, bottom: 8 },
    };

    if (chartType === "bar") {
      return (
        <BarChart layout="vertical" {...commonProps}>
          <CartesianGrid {...gridProps} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="merchant"
            tick={{ fontSize: 11 }}
            width={130}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            content={
              <CustomLegend
                hidden={hidden}
                onToggle={toggleHidden}
                colorMap={colorMap}
              />
            }
          />
          {visibleCategories.map((cat) => renderSeries(cat))}
        </BarChart>
      );
    }

    if (chartType === "line" || chartType === "spline") {
      return (
        <LineChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            content={
              <CustomLegend
                hidden={hidden}
                onToggle={toggleHidden}
                colorMap={colorMap}
              />
            }
          />
          {visibleCategories.map((cat) => renderSeries(cat))}
        </LineChart>
      );
    }

    if (chartType === "area") {
      return (
        <AreaChart {...commonProps}>
          <CartesianGrid {...gridProps} />
          <XAxis {...xAxisProps} />
          <YAxis {...yAxisProps} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            content={
              <CustomLegend
                hidden={hidden}
                onToggle={toggleHidden}
                colorMap={colorMap}
              />
            }
          />
          {visibleCategories.map((cat) => renderSeries(cat))}
        </AreaChart>
      );
    }

    // Default: column (vertical bars)
    return (
      <BarChart {...commonProps}>
        <CartesianGrid {...gridProps} />
        <XAxis {...xAxisProps} />
        <YAxis {...yAxisProps} />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          content={
            <CustomLegend
              hidden={hidden}
              onToggle={toggleHidden}
              colorMap={colorMap}
            />
          }
        />
        {visibleCategories.map((cat) => renderSeries(cat))}
      </BarChart>
    );
  }

  return (
    <Card className="border-border/70 shadow-xs">
      <CardHeader className="border-b border-border/50 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Call Center Performance Analysis</CardTitle>
            <CardDescription className="mt-1">
              Assessing Customer Interactions and Response Metrics
            </CardDescription>
          </div>

          {/* Chart type switcher */}
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
            {CHART_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setChartType(opt.value)}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  chartType === opt.value
                    ? "bg-background font-medium shadow-xs text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {loading && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
        {!loading && error && (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}
        {!loading && !error && chartData.length === 0 && (
          <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            No allocation updates recorded yet.
          </div>
        )}
        {!loading && !error && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={360}>
            {renderChart()}
          </ResponsiveContainer>
        )}
        <p className="mt-2 text-right text-[10px] text-muted-foreground">
          Cosmetics.lk
        </p>
      </CardContent>
    </Card>
  );
}
