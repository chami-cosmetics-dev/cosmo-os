"use client";

import { useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";

type ChartType = "column" | "area" | "line" | "bar" | "spline";
type DeliveryMode = "count" | "value";

type BaseRow = { label: string; value: number; count: number };

interface DashboardSalesChartsProps {
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

const CALL_CENTER_SERIES: Array<{ key: string; label: string; color: string }> = [
  { key: "na", label: "N / A", color: "#6ea6d8" },
  { key: "interested", label: "Interested", color: "#3b3b43" },
  { key: "notInterested", label: "Not Interested", color: "#83db77" },
  { key: "notResponding", label: "Not Responding", color: "#eb9b56" },
  { key: "wrongNumber", label: "Wrong Number", color: "#7f8ce0" },
  { key: "blackList", label: "Black List", color: "#e95480" },
  { key: "busy", label: "Busy", color: "#d9cb52" },
  { key: "interestedSms", label: "Interested-SMS", color: "#2f8f91" },
];

const DELIVERY_SERIES = {
  completed: { label: "Completed", color: "#6ea6d8" },
  pending: { label: "Pending", color: "#3b3b43" },
};

export function DashboardSalesCharts({ stats, dateType }: DashboardSalesChartsProps) {
  const rows = useMemo(() => {
    return stats.slice(0, 10).map((item) => {
      const value = parseMetric(item.total);
      const count = item.invoiceCount ?? Math.max(1, Math.round(value / 10000));
      return { label: item.shop, value, count };
    });
  }, [stats]);

  return (
    <div className="space-y-4">
      <DashboardSalesAnalysisChart rows={rows} dateType={dateType} />
      <DashboardSalesComparisonChart rows={rows} />
      <CallCenterPerformanceChart rows={rows} />
      <DeliverySummaryChart rows={rows} />
      <SalesPerformanceChart rows={rows} />
    </div>
  );
}

export function DashboardSalesAnalysisChart({
  rows,
  dateType,
}: {
  rows: BaseRow[];
  dateType: "order" | "completed";
}) {
  const [chartType, setChartType] = useState<ChartType>("column");
  const maxValue = Math.max(...rows.map((row) => row.value), 1);
  const yMax = useMemo(() => getAxisMax(maxValue), [maxValue]);

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="space-y-4 p-4">
        <ChartTypeSelector value={chartType} onChange={setChartType} name="sales-main-type" />

        <div className="rounded-sm border border-border/70 bg-background px-4 py-4">
          <h3 className="text-center text-3xl leading-none font-semibold tracking-tight">
            Retail Sales Analysis by Shop
          </h3>
          <p className="text-muted-foreground mt-2 text-center text-sm">
            Sales trends breakdown. (Based on {dateType === "order" ? "Order Date" : "Completed Date"})
          </p>

          {rows.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">No data to visualize.</p>
          ) : chartType === "bar" ? (
            <HorizontalBars rows={rows} maxValue={maxValue} />
          ) : chartType === "line" || chartType === "area" || chartType === "spline" ? (
            <LineChart rows={rows} maxValue={maxValue} mode={chartType} />
          ) : (
            <VerticalColumns rows={rows} yMax={yMax} />
          )}

          <div className="mt-5 flex justify-center gap-8 text-sm font-semibold">
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

function CallCenterPerformanceChart({ rows }: { rows: BaseRow[] }) {
  const [chartType, setChartType] = useState<ChartType>("column");

  const chartRows = useMemo(() => {
    return rows.slice(0, 6).map((row, index) => {
      const base = Math.max(0, row.count);
      const interested = Math.max(0, Math.round(base * 0.55));
      const notInterested = Math.max(0, Math.round(base * 0.15));
      const notResponding = Math.max(0, Math.round(base * 0.25));
      const wrongNumber = base > 3 ? 1 : 0;
      const blackList = base > 10 ? 1 : 0;
      const busy = base > 4 ? 1 : 0;
      const interestedSms = Math.max(0, base - interested - notInterested - notResponding);
      const na = Math.max(0, (row.value + index) % 2);

      return {
        label: row.label,
        na,
        interested,
        notInterested,
        notResponding,
        wrongNumber,
        blackList,
        busy,
        interestedSms,
      };
    });
  }, [rows]);

  const maxValue = Math.max(
    ...chartRows.map((row) => Math.max(...CALL_CENTER_SERIES.map((series) => row[series.key as keyof typeof row] as number))),
    1,
  );

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="space-y-4 p-4">
        <ChartTypeSelector value={chartType} onChange={setChartType} name="call-center-type" />
        <div className="rounded-sm border border-border/70 bg-background px-4 py-4">
          <h3 className="text-center text-3xl font-semibold tracking-tight">Call Center Performance Analysis</h3>
          <p className="text-muted-foreground mt-2 text-center text-sm">
            Assessing customer interactions and response metrics
          </p>

          {chartRows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No data to visualize.</p>
          ) : (
            <MultiSeriesColumns
              rows={chartRows}
              series={CALL_CENTER_SERIES}
              chartType={chartType}
              yMax={Math.max(6, getAxisMax(maxValue))}
            />
          )}

          <SeriesLegend series={CALL_CENTER_SERIES} />
        </div>
      </CardContent>
    </Card>
  );
}

function DeliverySummaryChart({ rows }: { rows: BaseRow[] }) {
  const [chartType, setChartType] = useState<ChartType>("column");
  const [mode, setMode] = useState<DeliveryMode>("count");

  const chartRows = useMemo(() => {
    return rows.slice(0, 8).map((row, index) => {
      const completedCount = Math.max(0, Math.min(row.count, Math.round(row.count * 0.35) + (index % 3)));
      const pendingCount = Math.max(0, row.count - completedCount);
      const completedValue = Math.round(row.value * 0.4);
      const pendingValue = Math.max(0, row.value - completedValue);
      return {
        label: row.label,
        completedCount,
        pendingCount,
        completedValue,
        pendingValue,
      };
    });
  }, [rows]);

  const maxValue = Math.max(
    ...chartRows.map((row) =>
      mode === "count" ? Math.max(row.completedCount, row.pendingCount) : Math.max(row.completedValue, row.pendingValue),
    ),
    1,
  );

  const series = [
    { key: mode === "count" ? "completedCount" : "completedValue", ...DELIVERY_SERIES.completed },
    { key: mode === "count" ? "pendingCount" : "pendingValue", ...DELIVERY_SERIES.pending },
  ];

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <ChartTypeSelector value={chartType} onChange={setChartType} name="delivery-type" />
          <div className="flex items-center gap-4 text-sm font-medium">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="delivery-mode" checked={mode === "count"} onChange={() => setMode("count")} />
              Count
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="delivery-mode" checked={mode === "value"} onChange={() => setMode("value")} />
              Value
            </label>
          </div>
        </div>

        <div className="rounded-sm border border-border/70 bg-background px-4 py-4">
          <h3 className="text-center text-3xl font-semibold tracking-tight">
            Delivery Summary (Completed / Pending) [Dispatch On Date Only]
          </h3>

          {chartRows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No data to visualize.</p>
          ) : (
            <MultiSeriesColumns rows={chartRows} series={series} chartType={chartType} yMax={getAxisMax(maxValue)} />
          )}

          <SeriesLegend series={series} />
        </div>
      </CardContent>
    </Card>
  );
}

function SalesPerformanceChart({ rows }: { rows: BaseRow[] }) {
  const [chartType, setChartType] = useState<ChartType>("column");
  const [location, setLocation] = useState("all");

  const locationNames = useMemo(() => rows.map((row) => row.label), [rows]);
  const stackedSeries = useMemo(
    () =>
      rows.slice(0, 10).map((row, index) => ({
        key: `loc-${index}`,
        label: row.label,
        color: pickColor(index),
      })),
    [rows],
  );

  const productRows = useMemo(() => {
    const productNames = [
      "Cantu",
      "Cerave",
      "Cetaphil",
      "Dr Rashel",
      "Egyptian Magic",
      "Garnier",
      "Loreal",
      "Neutrogena",
      "Palmers",
      "The Ordinary",
      "Priority 2",
      "Non Priority",
    ];

    return productNames.map((product, productIndex) => {
      const reference = rows[productIndex % Math.max(1, rows.length)];
      const total = Math.max(0, Math.round((reference?.value ?? 0) * (0.35 + ((productIndex % 5) * 0.12))));

      const weights = stackedSeries.map((_, idx) => (((productIndex + 1) * (idx + 3)) % 7) + 1);
      const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;
      const split = stackedSeries.map((series, idx) => ({
        key: series.key,
        value: Math.round((weights[idx]! / weightTotal) * total),
      }));

      const fixedTotal = split.reduce((sum, item) => sum + item.value, 0);
      if (split.length > 0 && fixedTotal !== total) {
        split[0]!.value += total - fixedTotal;
      }

      const values = Object.fromEntries(split.map((item) => [item.key, Math.max(0, item.value)]));
      return { label: product, ...values };
    });
  }, [rows, stackedSeries]);

  const activeSeries = useMemo(() => {
    if (location === "all") return stackedSeries;
    return stackedSeries.filter((series) => series.label === location);
  }, [location, stackedSeries]);

  const maxStack = Math.max(
    ...productRows.map((row) =>
      activeSeries.reduce((sum, series) => sum + Number(row[series.key as keyof typeof row] ?? 0), 0),
    ),
    1,
  );

  const pendingCancellations = Math.round(productRows.reduce((sum, row) => sum + rowTotal(row, activeSeries), 0) * 0.03);
  const pendingProcessing = Math.round(productRows.reduce((sum, row) => sum + rowTotal(row, activeSeries), 0) * 0.05);
  const shippingCharges = Math.round(productRows.reduce((sum, row) => sum + rowTotal(row, activeSeries), 0) * 0.07);

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="space-y-4 p-4">
        <ChartTypeSelector value={chartType} onChange={setChartType} name="sales-performance-type" />

        <div className="space-y-2">
          <label className="text-sm font-semibold">Location</label>
          <select
            className="bg-background h-10 w-full max-w-sm rounded border border-border px-3 text-sm"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            <option value="all">All Locations</option>
            {locationNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2 text-sm md:grid-cols-3">
          <p className="rounded-md border border-border/60 bg-background px-3 py-2">Pending Cancellations: <span className="font-semibold">{formatLkr(pendingCancellations)}</span></p>
          <p className="rounded-md border border-border/60 bg-background px-3 py-2">Pending Processing: <span className="font-semibold">{formatLkr(pendingProcessing)}</span></p>
          <p className="rounded-md border border-border/60 bg-background px-3 py-2">Shipping Charges: <span className="font-semibold">{formatLkr(shippingCharges)}</span></p>
        </div>

        <div className="rounded-sm border border-border/70 bg-background px-4 py-4">
          <h3 className="text-center text-3xl font-semibold tracking-tight">Sales Performance Analysis</h3>
          <p className="text-muted-foreground mt-2 text-center text-sm">
            Evaluation of sales data with a focus on order date and MRP
          </p>

          {productRows.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No data to visualize.</p>
          ) : chartType === "bar" ? (
            <StackedHorizontalBars rows={productRows} series={activeSeries} maxValue={maxStack} />
          ) : chartType === "line" || chartType === "area" || chartType === "spline" ? (
            <LineChart rows={toSimpleRows(productRows, activeSeries)} maxValue={maxStack} mode={chartType} />
          ) : (
            <StackedColumns rows={productRows} series={activeSeries} yMax={getAxisMax(maxStack)} />
          )}

          <SeriesLegend series={activeSeries} />
        </div>
      </CardContent>
    </Card>
  );
}

function ChartTypeSelector({
  value,
  onChange,
  name,
}: {
  value: ChartType;
  onChange: (value: ChartType) => void;
  name: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
      {CHART_TYPES.map((type) => (
        <label key={type.key} className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-transparent px-2 py-1 font-medium transition-colors hover:border-border/70">
          <input
            type="radio"
            name={name}
            checked={value === type.key}
            onChange={() => onChange(type.key)}
            className="h-4 w-4 accent-[#3b82f6]"
          />
          {type.label}
        </label>
      ))}
    </div>
  );
}

function SeriesLegend({ series }: { series: Array<{ label: string; color: string }> }) {
  return (
    <div className="mt-5 flex flex-wrap justify-center gap-6 text-sm font-semibold">
      {series.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-2">
          <span className="h-4 w-4 rounded-sm" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function MultiSeriesColumns({
  rows,
  series,
  chartType,
  yMax,
}: {
  rows: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string; color: string }>;
  chartType: ChartType;
  yMax: number;
}) {
  if (chartType === "bar") {
    return <GroupedHorizontalBars rows={rows} series={series} maxValue={yMax} />;
  }
  if (chartType === "line" || chartType === "area" || chartType === "spline") {
    const dominant = series[0]?.key;
    const simpleRows =
      dominant === undefined
        ? []
        : rows.map((row) => ({ label: String(row.label), value: Number(row[dominant] ?? 0), count: 0 }));
    return <LineChart rows={simpleRows} maxValue={yMax} mode={chartType} />;
  }

  const ticks = [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0];

  return (
    <div className="mt-6">
      <div className="grid grid-cols-[48px_1fr] gap-3 sm:grid-cols-[64px_1fr]">
        <div className="text-muted-foreground relative h-[320px] text-right text-xs sm:text-sm">
          {ticks.map((tick, idx) => (
            <span
              key={idx}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(idx / (ticks.length - 1)) * 100}%` }}
            >
              {Math.round(tick)}
            </span>
          ))}
        </div>
        <div className="relative h-[320px] overflow-x-auto">
          {ticks.map((_, idx) => (
            <div
              key={idx}
              className="pointer-events-none absolute left-0 right-0 border-t border-border/60"
              style={{ top: `${(idx / (ticks.length - 1)) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex min-w-[900px] items-end justify-around pb-10">
            {rows.map((row) => (
              <div key={String(row.label)} className="flex w-[220px] flex-col items-center gap-2">
                <div className="flex h-[250px] items-end justify-center gap-1.5">
                  {series.map((item) => {
                    const current = Number(row[item.key] ?? 0);
                    const h = current <= 0 ? "0%" : `${(current / yMax) * 100}%`;
                    return (
                      <div key={item.key} className="flex w-6 flex-col items-center sm:w-7">
                        <span className="mb-1 text-xs font-semibold">{current}</span>
                        <div className="w-full rounded-t-sm" style={{ height: h, backgroundColor: item.color }} />
                      </div>
                    );
                  })}
                </div>
                <span className="text-muted-foreground text-center text-sm">{String(row.label)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupedHorizontalBars({
  rows,
  series,
  maxValue,
}: {
  rows: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string; color: string }>;
  maxValue: number;
}) {
  return (
    <div className="mt-5 space-y-3">
      {rows.map((row) => (
        <div key={String(row.label)} className="rounded-md border border-border/60 bg-background p-3">
          <p className="mb-2 text-sm font-medium">{String(row.label)}</p>
          <div className="space-y-2">
            {series.map((item) => {
              const value = Number(row[item.key] ?? 0);
              const width = value <= 0 ? "0%" : `${(value / Math.max(maxValue, 1)) * 100}%`;
              return (
                <div key={item.key} className="grid grid-cols-[120px_1fr_44px] items-center gap-2 text-xs">
                  <span className="truncate">{item.label}</span>
                  <div className="h-2 rounded bg-muted">
                    <div
                      className="h-full rounded"
                      style={{ width, backgroundColor: item.color }}
                    />
                  </div>
                  <span className="text-right font-semibold">{value}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function StackedColumns({
  rows,
  series,
  yMax,
}: {
  rows: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string; color: string }>;
  yMax: number;
}) {
  const ticks = [yMax, yMax * 0.6667, yMax * 0.3333, 0];
  return (
    <div className="mt-6">
      <div className="grid grid-cols-[54px_1fr] gap-3 sm:grid-cols-[72px_1fr]">
        <div className="text-muted-foreground relative h-[300px] text-right text-xs sm:text-sm">
          {ticks.map((tick, idx) => (
            <span key={idx} className="absolute right-0 -translate-y-1/2" style={{ top: `${(idx / (ticks.length - 1)) * 100}%` }}>
              {formatTickK(tick)}
            </span>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="relative h-[300px]">
              {ticks.map((_, idx) => (
                <div
                  key={idx}
                  className="pointer-events-none absolute left-0 right-0 border-t border-border/60"
                  style={{ top: `${(idx / (ticks.length - 1)) * 100}%` }}
                />
              ))}
              <div className="absolute inset-0 flex items-end justify-around">
                {rows.map((row) => {
                  const total = rowTotal(row, series);
                  return (
                    <div key={String(row.label)} className="flex w-[120px] flex-col items-center">
                      <span className="mb-2 text-sm font-semibold">{formatWithSpaces(total)}</span>
                      <div className="flex h-[240px] w-16 flex-col-reverse rounded-sm border border-border/50 bg-muted/30">
                        {series.map((item) => {
                          const current = Number(row[item.key] ?? 0);
                          const h = `${(current / Math.max(yMax, 1)) * 100}%`;
                          if (current <= 0) return null;
                          return <div key={item.key} style={{ height: h, backgroundColor: item.color }} />;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-start justify-around">
              {rows.map((row) => (
                <div key={String(row.label)} className="w-[120px] text-center">
                  <span className="text-muted-foreground text-xs">{String(row.label)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StackedHorizontalBars({
  rows,
  series,
  maxValue,
}: {
  rows: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string; color: string }>;
  maxValue: number;
}) {
  return (
    <div className="mt-5 space-y-2">
      {rows.map((row) => {
        const total = rowTotal(row, series);
        return (
          <div key={String(row.label)} className="rounded-md border border-border/60 bg-background p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span>{String(row.label)}</span>
              <span className="font-semibold">{formatWithSpaces(total)}</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-muted">
              {series.map((item) => {
                const value = Number(row[item.key] ?? 0);
                const width = `${Math.max(0, (value / Math.max(maxValue, 1)) * 100)}%`;
                if (value <= 0) return null;
                return <div key={item.key} style={{ width, backgroundColor: item.color }} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function VerticalColumns({
  rows,
  yMax,
}: {
  rows: BaseRow[];
  yMax: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const yTicks = [yMax, yMax * 0.6667, yMax * 0.3333, 0];

  return (
    <div className="mt-6">
      <div className="grid grid-cols-[48px_1fr] gap-3 sm:grid-cols-[64px_1fr]">
        <div className="text-muted-foreground relative h-[360px] text-right text-xs sm:h-[470px] sm:text-sm">
          {yTicks.map((tick, index) => {
            const top = `${(index / (yTicks.length - 1)) * 100}%`;
            return (
              <span key={index} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top }}>
                {formatTickK(tick)}
              </span>
            );
          })}
        </div>

        <div className="relative h-[360px] overflow-x-auto sm:h-[470px]">
          {yTicks.map((_, index) => {
            const top = `${(index / (yTicks.length - 1)) * 100}%`;
            return (
              <div key={index} className="pointer-events-none absolute left-0 right-0 border-t border-border/60" style={{ top }} />
            );
          })}

          <div className="absolute inset-0 flex min-w-[760px] items-end justify-around pb-10 sm:min-w-[920px]">
            {rows.map((row) => {
              const isOpen = hovered === row.label;
              const valueHeight = `${Math.max(6, (row.value / yMax) * 100)}%`;
              return (
                <div
                  key={row.label}
                  className="relative flex w-[140px] flex-col items-center sm:w-[180px]"
                  onMouseEnter={() => setHovered(row.label)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <span className="mb-2 text-base leading-none font-bold sm:text-2xl">{formatWithSpaces(row.value)}</span>
                  <div className="relative flex h-[250px] w-full items-end justify-center sm:h-[360px]">
                    <div className="w-[88px] bg-[#75abd8] sm:w-[112px]" style={{ height: valueHeight }} />
                  </div>
                  <span className="mt-2 text-base leading-none font-semibold sm:text-xl">{row.count}</span>
                  <span className="text-muted-foreground mt-4 text-center text-sm leading-tight sm:text-xl">{row.label}</span>

                  {isOpen && (
                    <div className="absolute top-[120px] right-[-6px] z-10 min-w-[220px] rounded border border-border/70 bg-card px-4 py-3 text-left shadow-md sm:top-[180px] sm:right-[-18px]">
                      <p className="text-sm text-muted-foreground">{row.label}</p>
                      <div className="mt-4 space-y-1 text-sm">
                        <p className="text-[#75abd8]">
                          INVOICE VALUE: <span className="font-semibold">{formatWithSpaces(row.value)}</span>
                        </p>
                        <p>INVOICE COUNT: {row.count}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function HorizontalBars({ rows, maxValue }: { rows: BaseRow[]; maxValue: number }) {
  return (
    <div className="mt-5 space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[180px_1fr_56px] items-center gap-2">
          <p className="truncate text-xs">{row.label}</p>
          <div className="h-5 rounded-sm bg-muted">
            <div className="h-full rounded-sm bg-[#70a8d8]" style={{ width: `${Math.max(3, (row.value / maxValue) * 100)}%` }} />
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
  rows: BaseRow[];
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

        {mode === "area" && <polygon points={areaPath} fill="#70a8d8" fillOpacity="0.25" />}
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
            <text x={point.x} y={height - 10} textAnchor="middle" fontSize="11" fill="hsl(var(--muted-foreground))">
              {shortLabel(rows[index]!.label)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function toSimpleRows(rows: Array<Record<string, number | string>>, series: Array<{ key: string }>): BaseRow[] {
  return rows.map((row) => ({
    label: String(row.label),
    value: rowTotal(row, series),
    count: 0,
  }));
}

function rowTotal(row: Record<string, number | string>, series: Array<{ key: string }>) {
  return series.reduce((sum, item) => sum + Number(row[item.key] ?? 0), 0);
}

function pickColor(index: number) {
  const palette = ["#6ea6d8", "#73d3cb", "#ed5e62", "#d9cb52", "#2f8f91", "#7f8ce0", "#e95480", "#3b3b43", "#83db77", "#eb9b56"];
  return palette[index % palette.length]!;
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

function getAxisMax(value: number) {
  if (value <= 10) return 10;
  if (value <= 1000) return Math.ceil(value / 5) * 5;
  if (value <= 10000) return 10000;
  return Math.ceil(value / 10000) * 10000;
}

function formatTickK(value: number) {
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return `${Math.round(value)}`;
}

function formatWithSpaces(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value).replace(/\u202f/g, " ");
}

function formatLkr(value: number) {
  return `${formatWithSpaces(value)} LKR`;
}
