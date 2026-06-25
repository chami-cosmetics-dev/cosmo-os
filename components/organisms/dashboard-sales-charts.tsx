"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BaseRow = { label: string; value: number; count: number };
type ChartMode = "bar" | "line" | "area";
type SalesTooltipPayload = {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
};

interface DashboardSalesChartsProps {
  stats: Array<{
    shop: string;
    total: string;
    invoiceCount?: number;
  }>;
}

export function DashboardSalesCharts({ stats }: DashboardSalesChartsProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("bar");

  const rows = useMemo(() => {
    return stats.slice(0, 10).map((item) => {
      const value = parseMetric(item.total);
      const count = item.invoiceCount ?? Math.max(1, Math.round(value / 10000));
      return { label: item.shop, value, count };
    });
  }, [stats]);

  const totalValue = rows.reduce((sum, row) => sum + row.value, 0);
  const totalCount = rows.reduce((sum, row) => sum + row.count, 0);
  const topRow = rows[0] ?? null;

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="space-y-4 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--secondary)_16%,transparent),transparent_70%)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Invoice Value vs Count</h3>
            <p className="text-muted-foreground text-sm">
              Compare invoice totals and invoice count by shop
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="w-[180px]">
              <Select
                value={chartMode}
                onValueChange={(value) => setChartMode(value as ChartMode)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select chart type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar Chart</SelectItem>
                  <SelectItem value="line">Line Chart</SelectItem>
                  <SelectItem value="area">Area Chart</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-border bg-secondary/20 px-3 py-1">
                  Total Value: {formatWithSpaces(totalValue)}
                </span>
              <span className="rounded-full border border-border bg-secondary/20 px-3 py-1">
                Total Count: {totalCount}
              </span>
              {topRow && (
                <span className="rounded-full border border-border bg-accent/40 px-3 py-1">
                  Top Shop: {topRow.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No data to visualize.</p>
        ) : (
          <div className="h-[420px] w-full rounded-xl border border-border/60 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_80%,white),color-mix(in_srgb,var(--secondary)_14%,var(--background)))] p-3 dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_92%,black),color-mix(in_srgb,var(--secondary)_18%,var(--background)))]">
            <ResponsiveContainer width="100%" height="100%">
              {renderChart(chartMode, rows)}
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function renderChart(mode: ChartMode, rows: BaseRow[]) {
  const sharedProps = {
    data: rows,
    margin: { top: 16, right: 24, left: 12, bottom: 56 },
  };
  const axisTick = { fontSize: 12, fill: "#dbeafe", fontWeight: 700 };
  const axisLine = { stroke: "rgba(219, 234, 254, 0.52)" };
  const gridStroke = "rgba(219, 234, 254, 0.38)";
  const legendFormatter = (value: string) => (
    <span className="font-semibold text-blue-50">{value}</span>
  );

  if (mode === "line") {
    return (
      <LineChart {...sharedProps}>
        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          angle={-20}
          textAnchor="end"
          height={70}
          interval={0}
          tick={axisTick}
          axisLine={axisLine}
          tickLine={axisLine}
        />
        <YAxis
          yAxisId="value"
          tickFormatter={(value) => formatCompact(Number(value))}
          tick={axisTick}
          axisLine={axisLine}
          tickLine={axisLine}
        />
        <YAxis
          yAxisId="count"
          orientation="right"
          tick={axisTick}
          axisLine={axisLine}
          tickLine={axisLine}
          allowDecimals={false}
        />
        <Tooltip content={<SalesTooltip />} cursor={{ stroke: "rgba(255,255,255,0.42)", strokeWidth: 1.5 }} />
        <Legend formatter={legendFormatter} />
        <Line
          yAxisId="value"
          type="monotone"
          dataKey="value"
          name="Invoice Value"
          stroke="var(--chart-1)"
          strokeWidth={3}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
        <Line
          yAxisId="count"
          type="monotone"
          dataKey="count"
          name="Invoice Count"
          stroke="var(--chart-3)"
          strokeWidth={3}
          dot={{ r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    );
  }

  if (mode === "area") {
    return (
      <AreaChart {...sharedProps}>
        <defs>
          <linearGradient id="invoiceValueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="invoiceCountFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-3)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--chart-3)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          angle={-20}
          textAnchor="end"
          height={70}
          interval={0}
          tick={axisTick}
          axisLine={axisLine}
          tickLine={axisLine}
        />
        <YAxis
          yAxisId="value"
          tickFormatter={(value) => formatCompact(Number(value))}
          tick={axisTick}
          axisLine={axisLine}
          tickLine={axisLine}
        />
        <YAxis
          yAxisId="count"
          orientation="right"
          tick={axisTick}
          axisLine={axisLine}
          tickLine={axisLine}
          allowDecimals={false}
        />
        <Tooltip content={<SalesTooltip />} cursor={{ stroke: "rgba(255,255,255,0.42)", strokeWidth: 1.5 }} />
        <Legend formatter={legendFormatter} />
        <Area
          yAxisId="value"
          type="monotone"
          dataKey="value"
          name="Invoice Value"
          stroke="var(--chart-1)"
          fill="url(#invoiceValueFill)"
          strokeWidth={2.5}
        />
        <Area
          yAxisId="count"
          type="monotone"
          dataKey="count"
          name="Invoice Count"
          stroke="var(--chart-3)"
          fill="url(#invoiceCountFill)"
          strokeWidth={2.5}
        />
      </AreaChart>
    );
  }

  return (
    <BarChart {...sharedProps}>
      <CartesianGrid stroke={gridStroke} strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="label"
        angle={-20}
        textAnchor="end"
        height={70}
        interval={0}
        tick={axisTick}
        axisLine={axisLine}
        tickLine={axisLine}
      />
      <YAxis
        yAxisId="value"
        tickFormatter={(value) => formatCompact(Number(value))}
        tick={axisTick}
        axisLine={axisLine}
        tickLine={axisLine}
      />
      <YAxis
        yAxisId="count"
        orientation="right"
        tick={axisTick}
        axisLine={axisLine}
        tickLine={axisLine}
        allowDecimals={false}
      />
      <Tooltip
        content={<SalesTooltip />}
        cursor={{ fill: "rgba(255,255,255,0.16)" }}
      />
      <Legend formatter={legendFormatter} />
      <Bar
        yAxisId="value"
        dataKey="value"
        name="Invoice Value"
        fill="var(--chart-1)"
        radius={[6, 6, 0, 0]}
      />
      <Bar
        yAxisId="count"
        dataKey="count"
        name="Invoice Count"
        fill="var(--chart-3)"
        radius={[6, 6, 0, 0]}
      />
    </BarChart>
  );
}

function SalesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: SalesTooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="min-w-[15rem] rounded-lg border border-white/25 bg-slate-950 px-4 py-3 text-white shadow-2xl ring-1 ring-cyan-200/20 dark:bg-slate-950">
      <p className="mb-2 text-sm font-bold leading-5 text-white">{label}</p>
      <div className="space-y-1.5">
        {payload.map((item) => {
          const isValue = item.name === "Invoice Value" || item.dataKey === "value";
          return (
            <div
              key={`${item.dataKey ?? item.name}`}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <span className="font-semibold text-slate-100">{item.name}</span>
              <span
                className="font-bold tabular-nums"
                style={{ color: isValue ? "#c4b5fd" : "#67e8f9" }}
              >
                {isValue ? formatWithSpaces(Number(item.value ?? 0)) : Number(item.value ?? 0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function parseMetric(value: string) {
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatWithSpaces(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value).replace(/\u202f/g, " ");
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
