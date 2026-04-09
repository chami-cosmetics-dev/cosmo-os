"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Label, Pie, PieChart, Sector } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";

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

/** Parallel route `@main` — sales charts driven by `@filters` state (client). */
export function DashboardMainSlot() {
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
        agent: topMerchant?.merchantName ?? "Unassigned",
        agentValue: formatMetric(topMerchant?.total ?? 0),
      };
    })
    .sort((a, b) => parseMetric(b.total) - parseMetric(a.total));

  const donutGridStats = salesLocations
    .map((location) => {
      const merchantTotals = [...location.merchants].sort((a, b) => b.total - a.total);
      const total = merchantTotals.reduce((sum, merchant) => sum + merchant.total, 0);
      const topMerchant = merchantTotals[0];

      return {
        shop: location.name,
        total: formatMetric(total),
        agent: topMerchant?.merchantName ?? "Unassigned",
        agentValue: formatMetric(topMerchant?.total ?? 0),
        segments: buildSegmentsFromRows(merchantTotals),
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
      />
      <DashboardSalesCharts stats={salesChartStats} />
      <DashboardLocationMerchantChartsDynamic
        key={`${fromDate}-${toDate}-${dateType}-${analysisType}`}
        locations={salesLocations}
        dateType={dateType}
        filterInfo={filterInfo}
        breakdownVariant={analysisType === "gateway" ? "gateway" : "merchant"}
      />
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
    agent: string;
    agentValue: string;
    segments: Array<{ value: number; color: string }>;
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
          <LegendDot color="#4f95bf" label="Primary Sales" />
          <LegendDot color="#06b06c" label="Secondary Sales" />
          <LegendDot color="#f06a57" label="Other Sources" />
          <span className="text-muted-foreground ml-1">{stats.length} locations</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
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
                name={stat.agent}
                value={stat.agentValue}
                segments={stat.segments}
              />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                {stat.segments.map((segment, index) => (
                  <div
                    key={`${stat.shop}-${index}`}
                    className="rounded-xl border border-slate-200 bg-slate-50/80 px-2 py-1.5 dark:border-border dark:bg-background/60"
                  >
                    <div
                      className="mx-auto mb-1.5 h-1.5 w-10 rounded-full"
                      style={{ backgroundColor: segment.color }}
                    />
                    <p className="text-muted-foreground">{getSegmentLabel(index)}</p>
                    <p className="font-semibold text-slate-800 dark:text-foreground">{segment.value}%</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function DonutChartCard({
  name,
  value,
  segments,
}: {
  name: string;
  value: string;
  segments: Array<{ value: number; color: string }>;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartData = segments.map((segment, index) => ({
    key: `segment-${index + 1}`,
    label: getSegmentLabel(index),
    value: segment.value,
    fill: segment.color,
  }));
  const chartConfig = chartData.reduce<ChartConfig>((config, segment) => {
    config[segment.key] = {
      label: segment.label,
      color: segment.fill,
    };
    return config;
  }, {});

  return (
    <div className="mx-auto mt-6 h-[14.5rem] w-[14.5rem] max-w-full">
      <ChartContainer config={chartConfig} className="mx-auto aspect-square h-full w-full">
        <PieChart>
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                hideLabel
                formatter={(chartValue, _name, item) => {
                  const payload = item.payload as {
                    label: string;
                    value: number;
                  };
                  return (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span>{payload.label}</span>
                      <span className="font-medium tabular-nums">{Number(chartValue)}%</span>
                    </div>
                  );
                }}
              />
            }
          />
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
                        className="fill-slate-500 text-[10px] uppercase dark:fill-muted-foreground"
                      >
                        Primary Agent
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) - 2}
                        className="fill-slate-900 text-[11px] font-semibold dark:fill-foreground"
                      >
                        {name}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 28}
                        className="fill-slate-900 text-[20px] font-bold dark:fill-foreground"
                      >
                        {value}
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

function getSegmentLabel(index: number) {
  if (index === 0) return "Primary";
  if (index === 1) return "Secondary";
  return "Other";
}

function buildSegmentsFromRows(rows: Array<{ total: number }>) {
  const total = rows.reduce((sum, row) => sum + row.total, 0) || 1;
  const palette = ["#4f95bf", "#06b06c", "#f06a57"];
  const topThree = rows.slice(0, 3).map((row, index) => ({
    value: Math.max(1, Math.round((row.total / total) * 100)),
    color: palette[index],
  }));

  if (topThree.length === 1) {
    return [{ value: 100, color: palette[0] }];
  }

  return topThree;
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
