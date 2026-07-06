"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const SEGMENT_COLORS = [
  "#a78bfa",
  "#5eead4",
  "#fb7185",
  "#60a5fa",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#38bdf8",
  "#c084fc",
  "#f97316",
  "#84cc16",
  "#e879f9",
  "#22c55e",
  "#f43f5e",
  "#06b6d4",
  "#facc15",
  "#818cf8",
  "#14b8a6",
];

type MerchantRow = {
  merchantName: string;
  total: number;
  orderCount: number;
};

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

type StackedRow = {
  name: string;
  nameShort: string;
  total: number;
  [segmentKey: string]: string | number;
};

function rowVisibleTotal(row: StackedRow, segmentKeys: string[], hidden: Set<string>) {
  return segmentKeys
    .filter((k) => !hidden.has(k))
    .reduce((s, k) => s + Number(row[k] ?? 0), 0);
}

interface DashboardLocationStackedHorizontalChartProps {
  locations: Array<{
    id: string;
    name: string;
    merchants: MerchantRow[];
  }>;
  dateHint: string;
  breakdownVariant?: "merchant" | "gateway";
}

function ToggleableLegendContent({
  payload,
  hidden,
  onToggle,
  chartConfig,
}: {
  payload?: Array<{ dataKey?: unknown; color?: string; value?: unknown; type?: string }>;
  hidden: Set<string>;
  onToggle: (dataKey: string) => void;
  chartConfig: ChartConfig;
}) {
  if (!payload?.length) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
      {payload
        .filter((item) => item.type !== "none")
        .map((item) => {
          const key = String(item.dataKey ?? "");
          const itemConfig = chartConfig[key as keyof typeof chartConfig];
          const isHidden = hidden.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              aria-pressed={isHidden}
              title={isHidden ? "Show in chart" : "Hide from chart"}
              className={cn(
                "flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-xs transition-colors",
                "hover:bg-muted/60 focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                isHidden ? "text-muted-foreground line-through opacity-50" : "text-foreground",
              )}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color as string }}
                aria-hidden
              />
              <span>{itemConfig?.label ?? key}</span>
            </button>
          );
        })}
    </div>
  );
}

export function DashboardLocationStackedHorizontalChart({
  locations,
  dateHint,
  breakdownVariant = "merchant",
}: DashboardLocationStackedHorizontalChartProps) {
  const [hiddenSegments, setHiddenSegments] = useState<Set<string>>(() => new Set());
  const isGateway = breakdownVariant === "gateway";
  const segmentNoun = isGateway ? "gateway" : "merchant";

  const { chartData, segmentKeys, chartConfig } = useMemo(() => {
    const globalTotals = new Map<string, number>();
    for (const loc of locations) {
      for (const m of loc.merchants) {
        globalTotals.set(m.merchantName, (globalTotals.get(m.merchantName) ?? 0) + m.total);
      }
    }

    const sortedMerchants = [...globalTotals.entries()].sort((a, b) => b[1] - a[1]);

    const segmentMeta: Array<{ key: string; label: string }> = sortedMerchants.map(([name], i) => ({
      key: `seg_${i}`,
      label: name,
    }));

    const rows: StackedRow[] = locations.map((loc) => {
      const row: StackedRow = {
        name: loc.name,
        nameShort: loc.name.length > 40 ? `${loc.name.slice(0, 38)}…` : loc.name,
        total: 0,
      };
      for (const { key } of segmentMeta) {
        row[key] = 0;
      }

      let sum = 0;
      for (const m of loc.merchants) {
        sum += m.total;
        const idx = sortedMerchants.findIndex(([name]) => name === m.merchantName);
        if (idx >= 0) {
          const k = `seg_${idx}`;
          row[k] = (row[k] as number) + m.total;
        }
      }
      row.total = sum;
      return row;
    });

    const keys = segmentMeta.map((s) => s.key);

    const config: ChartConfig = {};
    segmentMeta.forEach((s, i) => {
      config[s.key] = {
        label: s.label,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
      };
    });

    return { chartData: rows, segmentKeys: keys, chartConfig: config };
  }, [locations]);

  const toggleSegment = useCallback((dataKey: string) => {
    setHiddenSegments((prev) => {
      const next = new Set(prev);
      if (next.has(dataKey)) next.delete(dataKey);
      else next.add(dataKey);
      return next;
    });
  }, []);

  const visibleKeys = useMemo(
    () => segmentKeys.filter((k) => !hiddenSegments.has(k)),
    [segmentKeys, hiddenSegments],
  );

  useEffect(() => {
    setHiddenSegments((prev) => {
      const next = new Set<string>();
      for (const k of prev) {
        if (segmentKeys.includes(k)) next.add(k);
      }
      return next.size === prev.size && [...prev].every((k) => next.has(k)) ? prev : next;
    });
  }, [segmentKeys]);

  const chartHeight = Math.min(720, Math.max(280, chartData.length * 52));
  const yAxisWidth = useMemo(() => {
    const maxLen = chartData.reduce((m, r) => Math.max(m, r.nameShort.length), 0);
    return Math.min(220, Math.max(100, maxLen * 7 + 16));
  }, [chartData]);

  if (chartData.length === 0) {
    return null;
  }

  const lastVisibleKey = visibleKeys[visibleKeys.length - 1];

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">
          Sales by location (total &amp; {isGateway ? "payment gateway" : "merchant"} mix)
        </CardTitle>
        <CardDescription>
          Each bar is location total; colored segments are {isGateway ? "primary payment gateway" : "merchant"}{" "}
          share. Every {segmentNoun} is shown separately. Click a name below to show or hide that segment in the chart. · {dateHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div style={{ height: chartHeight }} className="w-full min-h-[280px]">
          <ChartContainer
            id={`dashboard-location-stacked-${breakdownVariant}`}
            config={chartConfig}
            className="aspect-auto h-full w-full"
          >
            <BarChart
              accessibilityLayer
              data={chartData}
              layout="vertical"
              margin={{ right: 56, left: 8, top: 8, bottom: 8 }}
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                dataKey="nameShort"
                type="category"
                tickLine={false}
                tickMargin={8}
                axisLine={false}
                width={yAxisWidth}
                className="text-xs"
              />
              <XAxis dataKey="total" type="number" hide />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="line"
                    formatter={(value, _name, item) => {
                      const row = item?.payload as StackedRow;
                      const v = Number(value ?? 0);
                      const dataKey = String(item?.dataKey ?? "");
                      const merchantName = String(chartConfig[dataKey]?.label ?? item?.name ?? _name ?? "");
                      const denom = row
                        ? rowVisibleTotal(row, segmentKeys, hiddenSegments)
                        : 0;
                      const pct =
                        denom > 0 ? ((v / denom) * 100).toFixed(1) : "0.0";
                      return (
                        <div className="flex w-full flex-col gap-0.5">
                          <span className="font-medium">{merchantName}</span>
                          <span className="font-medium tabular-nums">Sales: {formatCompact(v)}</span>
                          <span className="text-muted-foreground text-[11px]">
                            {pct}% of visible total
                          </span>
                        </div>
                      );
                    }}
                  />
                }
              />
              {segmentKeys.map((key) => {
                const hideBar = hiddenSegments.has(key);
                const vi = visibleKeys.indexOf(key);
                const isLastVisible = !hideBar && vi === visibleKeys.length - 1;
                const radius: [number, number, number, number] =
                  hideBar || visibleKeys.length === 0
                    ? [0, 0, 0, 0]
                    : visibleKeys.length === 1 || isLastVisible
                      ? [0, 4, 4, 0]
                      : [0, 0, 0, 0];

                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="loc"
                    hide={hideBar}
                    fill={`var(--color-${key})`}
                    radius={radius}
                    maxBarSize={44}
                  >
                    {!hideBar && key === lastVisibleKey ? (
                      <LabelList
                        content={(props) => {
                          const { x, y, width, height, payload } = props as {
                            x?: number | string;
                            y?: number | string;
                            width?: number | string;
                            height?: number | string;
                            payload?: StackedRow;
                          };
                          if (payload == null) return null;
                          const endX = Number(x ?? 0) + Number(width ?? 0);
                          const cy = Number(y ?? 0) + Number(height ?? 0) / 2;
                          const shown = rowVisibleTotal(payload, segmentKeys, hiddenSegments);
                          return (
                            <text
                              x={endX + 8}
                              y={cy}
                              dy="0.35em"
                              className="fill-foreground text-xs font-medium"
                              textAnchor="start"
                            >
                              {formatCompact(shown)}
                            </text>
                          );
                        }}
                      />
                    ) : null}
                  </Bar>
                );
              })}
              <ChartLegend
                content={(props) => (
                  <ToggleableLegendContent
                    payload={props.payload}
                    hidden={hiddenSegments}
                    onToggle={toggleSegment}
                    chartConfig={chartConfig}
                  />
                )}
              />
            </BarChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}
