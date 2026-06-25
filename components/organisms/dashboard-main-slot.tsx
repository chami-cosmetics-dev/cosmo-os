"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { CallCenterPerformanceChart } from "@/components/organisms/call-center-performance-chart";
import { Label, Pie, PieChart, Sector } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";

import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";

const DASHBOARD_SEGMENT_COLORS = [
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

const DashboardSalesCharts = dynamic(
  () =>
    import("@/components/organisms/dashboard-sales-charts").then(
      (module) => module.DashboardSalesCharts,
    ),
  {
    loading: () => <DashboardChartSectionSkeleton label="Loading sales charts..." />,
  },
);

const DashboardSummaryCharts = dynamic(
  () =>
    import("@/components/organisms/dashboard-summary-charts").then(
      (module) => module.DashboardSummaryCharts,
    ),
  {
    loading: () => <DashboardChartSectionSkeleton label="Loading summary charts..." />,
  },
);

const DashboardLocationMerchantChartsDynamic = dynamic(
  () =>
    import("@/components/organisms/dashboard-location-merchant-charts").then(
      (module) => module.DashboardLocationMerchantCharts,
    ),
  {
    loading: () => <DashboardChartSectionSkeleton label="Loading location charts..." />,
  },
);

const DashboardBrandSalesChartDynamic = dynamic(
  () =>
    import("@/components/organisms/dashboard-brand-sales-chart").then(
      (module) => module.DashboardBrandSalesChart,
    ),
  {
    loading: () => <DashboardChartSectionSkeleton label="Loading brand sales chart..." />,
  },
);

const DashboardDeliverySummaryChartDynamic = dynamic(
  () =>
    import("@/components/organisms/dashboard-delivery-summary-chart").then(
      (module) => module.DashboardDeliverySummaryChart,
    ),
  {
    loading: () => <DashboardChartSectionSkeleton label="Loading delivery summary..." />,
  },
);

/** Parallel route `@main` — sales charts driven by `@filters` state (client). */
export function DashboardMainSlot({ canEditDashboard = false }: { canEditDashboard?: boolean }) {
  const {
    fromDate,
    toDate,
    dateType,
    analysisType,
    salesLocations,
    salesLoading,
    salesError,
    filterInfo,
  } = useDashboardOverview();

  const summaryStats = salesLocations
    .map((location) => {
      const merchantTotals = [...location.merchants].sort((a, b) => b.total - a.total);
      const total = merchantTotals.reduce((sum, merchant) => sum + merchant.total, 0);
      const topMerchant = merchantTotals[0];

      return {
        shop: location.name,
        total: formatMetric(total),
        agent: topMerchant?.merchantName ?? "DM-General",
        agentValue: formatMetric(topMerchant?.total ?? 0),
      };
    })
    .sort((a, b) => parseMetric(b.total) - parseMetric(a.total));

  const summaryAgentSegments = (() => {
    const totals = new Map<string, number>();
    for (const location of salesLocations) {
      if (analysisType === "gateway") {
        for (const row of location.sources) {
          totals.set(row.sourceName, (totals.get(row.sourceName) ?? 0) + row.total);
        }
      } else {
        for (const row of location.merchants) {
          totals.set(row.merchantName, (totals.get(row.merchantName) ?? 0) + row.total);
        }
      }
    }
    return [...totals.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  })();

  const donutGridStats = salesLocations
    .map((location) => {
      const merchantTotals = [...location.merchants].sort((a, b) => b.total - a.total);
      const total = merchantTotals.reduce((sum, merchant) => sum + merchant.total, 0);
      const topMerchant = merchantTotals[0] ?? null;
      const merchantSegments = buildMerchantSegmentsFromRows(merchantTotals);
      const sourceBreakdown = buildSourceBreakdown(location.sources);
      const topSource =
        [...sourceBreakdown].sort((a, b) => b.rawTotal - a.rawTotal)[0] ?? null;
      const useSourcePie = merchantSegments.length === 0;

      return {
        shop: location.name,
        total: formatMetric(total),
        donutTitle: useSourcePie ? "Primary Source" : "Top Merchant",
        agent: useSourcePie
          ? topSource?.label ?? "Unassigned"
          : topMerchant?.merchantName ?? "DM-General",
        agentValue: formatMetric(
          useSourcePie
            ? (topSource?.rawTotal ?? 0)
            : (topMerchant?.total ?? 0),
        ),
        segments: useSourcePie
          ? sourceBreakdown
              .filter((source) => source.rawTotal > 0)
              .map((source) => ({
                label: source.label,
                value: source.percent,
                amount: source.rawTotal,
                color: source.color,
              }))
          : merchantSegments,
        sources: sourceBreakdown,
      };
    })
    .sort((a, b) => parseMetric(b.total) - parseMetric(a.total));

  const salesChartStats = salesLocations
    .map((location) => {
      const merchantTotals = [...location.merchants];
      const total = merchantTotals.reduce((sum, merchant) => sum + merchant.total, 0);
      const invoiceCount = merchantTotals.reduce((sum, merchant) => sum + merchant.orderCount, 0);

      return {
        shop: location.name,
        total: formatMetric(total),
        invoiceCount,
      };
    })
    .sort((a, b) => parseMetric(b.total) - parseMetric(a.total));

  if (salesError) {
    return (
      <Card className="border-destructive/40 bg-card shadow-xs">
        <CardContent className="space-y-2 py-6 text-center text-sm text-red-600">
          <p>{salesError}</p>
          <p className="text-muted-foreground text-xs">{filterInfo}</p>
        </CardContent>
      </Card>
    );
  }

  if (salesLoading) {
    return (
      <Card className="border-border/70 bg-card shadow-xs">
        <CardContent className="text-muted-foreground space-y-2 py-10 text-center text-sm">
          <p>Loading sales by location…</p>
          <p className="text-xs">{filterInfo}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardDonutGrid stats={donutGridStats} />
      <DashboardSummaryCharts
        analysisType={analysisType}
        stats={summaryStats}
        agentSegments={summaryAgentSegments}
      />
      <DashboardSalesCharts stats={salesChartStats} />
      <DashboardLocationMerchantChartsDynamic
        key={`${fromDate}-${toDate}-${dateType}-${analysisType}`}
        locations={salesLocations}
        dateType={dateType}
        filterInfo={filterInfo}
        breakdownVariant={analysisType === "gateway" ? "gateway" : "merchant"}
      />
      <DashboardBrandSalesChartDynamic canEditDashboard={canEditDashboard} />
      <DashboardDeliverySummaryChartDynamic />
      <CallCenterPerformanceChart fromDate={fromDate} toDate={toDate} />
    </div>
  );
}

function DashboardChartSectionSkeleton({ label }: { label: string }) {
  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="text-muted-foreground py-10 text-center text-sm">
        {label}
      </CardContent>
    </Card>
  );
}

function parseMetric(value: string) {
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatMetric(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function DashboardDonutGrid({
  stats,
}: {
  stats: Array<{
    shop: string;
    total: string;
    donutTitle: string;
    agent: string;
    agentValue: string;
    segments: Array<{ label: string; value: number; amount: number; color: string }>;
    sources: Array<{
      label: string;
      total: string;
      orders: number;
      color: string;
      rawTotal: number;
      percent: number;
    }>;
  }>;
}) {
  if (stats.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--background)_94%,white),color-mix(in_srgb,var(--secondary)_12%,var(--background)),color-mix(in_srgb,var(--accent)_10%,var(--background)))] p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
            Merchant Performance
          </h2>
          <p className="text-muted-foreground text-sm">
            Branch wise contribution and agent allocation overview
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground ml-1">{stats.length} locations</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <Card
            key={stat.shop}
            className="overflow-visible rounded-xl border border-slate-200 bg-white shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_34px_-22px_rgba(15,23,42,0.35)] dark:border-border dark:bg-card"
          >
            <div className="h-1 w-full bg-[linear-gradient(90deg,var(--chart-3),var(--chart-2),var(--chart-4))]" />
            <CardContent className="px-4 pb-5 pt-6">
              <div className="space-y-1 text-center">
                <p className="line-clamp-1 text-base leading-6 font-semibold tracking-tight text-slate-800 dark:text-foreground">
                  {stat.shop}
                </p>
                <p className="text-2xl font-semibold text-slate-700 dark:text-foreground">
                  {stat.total}
                </p>
              </div>
              <DonutChartCard
                chartId={`dashboard-main-donut-${index}`}
                title={stat.donutTitle}
                segments={stat.segments}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DonutChartCard({
  chartId,
  title,
  segments,
}: {
  chartId: string;
  title: string;
  segments: Array<{ label: string; value: number; amount: number; color: string }>;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartData = segments.map((segment, index) => ({
    key: `segment-${index + 1}`,
    label: segment.label,
    value: segment.value,
    amount: segment.amount,
    fill: segment.color,
  }));
  const chartConfig = chartData.reduce<ChartConfig>((config, segment) => {
    config[segment.key] = {
      label: segment.label,
      color: segment.fill,
    };
    return config;
  }, {});
  const activeSegment =
    activeIndex == null ? (chartData[0] ?? null) : chartData[activeIndex] ?? null;

  return (
    <div className="mx-auto mt-6 h-[14.5rem] w-[14.5rem] max-w-full">
      <ChartContainer id={chartId} config={chartConfig} className="mx-auto aspect-square h-full w-full">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="key"
            cx="50%"
            cy="50%"
            innerRadius={72}
            outerRadius={92}
            paddingAngle={2}
            strokeWidth={0}
            activeIndex={activeIndex ?? undefined}
            activeShape={renderActiveDonutShape}
            isAnimationActive
            animationDuration={260}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) - 26}
                        className="fill-slate-600 text-[10px] uppercase dark:fill-cyan-100/85"
                      >
                          {title}
                        </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) - 2}
                        className="fill-slate-950 text-[11px] font-semibold dark:fill-white"
                      >
                        {activeSegment?.label ?? "Hover segment"}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 24}
                        className="fill-slate-950 text-[18px] font-bold dark:fill-white"
                      >
                        {activeSegment ? formatMetric(activeSegment.amount) : ""}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 48}
                        className="fill-slate-700 text-[12px] font-semibold dark:fill-cyan-100"
                      >
                        {activeSegment ? `${activeSegment.value}%` : ""}
                      </tspan>
                    </text>
                  );
                }
              }}
            />
          </Pie>
        </PieChart>
      </ChartContainer>
    </div>
  );
}

function buildMerchantSegmentsFromRows(
  rows: Array<{ merchantName: string; total: number }>,
) {
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  if (total <= 0) {
    return [];
  }

  let assignedPercent = 0;

  return rows.map((row, index) => {
    const value =
      index === rows.length - 1
        ? Math.max(0, 100 - assignedPercent)
        : Math.round((row.total / total) * 100);
    assignedPercent += value;

    return {
      label: row.merchantName,
      value,
      amount: row.total,
      color:
        row.merchantName === "DM-General"
          ? "#fb7185"
          : DASHBOARD_SEGMENT_COLORS[index % DASHBOARD_SEGMENT_COLORS.length]!,
    };
  });
}

function buildSourceBreakdown(
  rows: Array<{ sourceName: string; total: number; orderCount: number }>
) {
  const buckets = {
    Web: { total: 0, orders: 0, color: "#4f95bf" },
    POS: { total: 0, orders: 0, color: "#8b5cf6" },
    Manual: { total: 0, orders: 0, color: "#f06a57" },
  };

  for (const row of rows) {
    const normalized = row.sourceName.trim().toLowerCase();
    if (normalized === "pos") {
      buckets.POS.total += row.total;
      buckets.POS.orders += row.orderCount;
      continue;
    }
    if (normalized === "manual") {
      buckets.Manual.total += row.total;
      buckets.Manual.orders += row.orderCount;
      continue;
    }

    buckets.Web.total += row.total;
    buckets.Web.orders += row.orderCount;
  }

  const total = Object.values(buckets).reduce((sum, bucket) => sum + bucket.total, 0);
  let assignedPercent = 0;
  const entries = Object.entries(buckets).sort(([, a], [, b]) => b.total - a.total);

  return entries.map(([label, bucket], index) => {
    const percent =
      total <= 0
        ? 0
        : index === entries.length - 1
          ? Math.max(0, 100 - assignedPercent)
          : Math.round((bucket.total / total) * 100);
    assignedPercent += percent;

    return {
      label,
      total: formatMetric(bucket.total),
      orders: bucket.orders,
      color: bucket.color,
      rawTotal: bucket.total,
      percent,
    };
  });
}

function renderActiveDonutShape(props: {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
  midAngle?: number;
}) {
  const {
    cx = 0,
    cy = 0,
    innerRadius = 72,
    outerRadius = 92,
    startAngle = 0,
    endAngle = 0,
    fill,
    midAngle = 0,
  } = props;

  const sweepAngle = Math.abs(endAngle - startAngle);
  const isFullCircle = sweepAngle >= 359;
  const radians = (-midAngle * Math.PI) / 180;
  const offsetDistance = isFullCircle ? 0 : 12;
  const offsetX = Math.cos(radians) * offsetDistance;
  const offsetY = Math.sin(radians) * offsetDistance;

  return (
    <g>
      <Sector
        cx={cx + offsetX}
        cy={cy + offsetY}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 5}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx + offsetX}
        cy={cy + offsetY}
        innerRadius={outerRadius + 8}
        outerRadius={outerRadius + 13}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.3}
      />
    </g>
  );
}
