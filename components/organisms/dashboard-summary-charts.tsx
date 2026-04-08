"use client";

import { useState } from "react";
import { Label, Pie, PieChart, Sector } from "recharts";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

interface DashboardSummaryChartsProps {
  analysisType: "merchant" | "gateway";
  stats: Array<{
    shop: string;
    total: string;
    agent: string;
    agentValue: string;
  }>;
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "color-mix(in srgb, var(--chart-1) 55%, white)",
  "color-mix(in srgb, var(--chart-2) 55%, white)",
  "color-mix(in srgb, var(--chart-3) 55%, white)",
  "color-mix(in srgb, var(--muted-foreground) 45%, transparent)",
];

export function DashboardSummaryCharts({
  analysisType,
  stats,
}: DashboardSummaryChartsProps) {
  const totals = stats.map((stat, index) => ({
    value: parseMetric(stat.total),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  const agentTotals = stats.map((stat, index) => ({
    value: parseMetric(stat.agentValue),
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));

  const grandTotal = totals.reduce((sum, current) => sum + current.value, 0);
  const agentGrandTotal = agentTotals.reduce((sum, current) => sum + current.value, 0);
  const remainder = Math.max(grandTotal - agentGrandTotal, 0);

  const leftCenter = stats.reduce(
    (best, current) =>
      parseMetric(current.total) > parseMetric(best.total) ? current : best,
    stats[0] ?? { shop: "-", total: "0", agent: "-", agentValue: "0" },
  );

  const rightCenter = stats.reduce(
    (best, current) =>
      parseMetric(current.agentValue) > parseMetric(best.agentValue) ? current : best,
    stats[0] ?? { shop: "-", total: "0", agent: "-", agentValue: "0" },
  );

  const rightSegments =
    remainder > 0
      ? [
          ...agentTotals,
          {
            value: remainder,
            color: "color-mix(in srgb, var(--muted-foreground) 32%, transparent)",
          },
        ]
      : agentTotals;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SummaryChartCard
        title="Grand Total"
        total={formatMetric(grandTotal)}
        centerLabel={leftCenter.shop}
        centerValue={leftCenter.total}
        segments={totals}
      />
      <SummaryChartCard
        title={`Grand Total - ${analysisType === "merchant" ? "Merchant Wise" : "Payment Gateway Wise"}`}
        total={formatMetric(grandTotal)}
        centerLabel={rightCenter.agent}
        centerValue={rightCenter.agentValue}
        segments={rightSegments}
      />
    </div>
  );
}

function SummaryChartCard({
  title,
  total,
  centerLabel,
  centerValue,
  segments,
}: {
  title: string;
  total: string;
  centerLabel: string;
  centerValue: string;
  segments: Array<{ value: number; color: string }>;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const chartData = segments.map((segment, index) => ({
    key: `segment-${index + 1}`,
    label: `Part ${index + 1}`,
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
    <Card className="overflow-hidden border-border/70 bg-card shadow-xs">
      <CardHeader className="space-y-2 border-b border-border/50 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_94%,white),transparent)] py-5 text-center">
        <p className="text-2xl font-semibold tracking-tight text-slate-800 dark:text-foreground">
          {title}
        </p>
        <p className="text-2xl font-semibold tracking-tight text-slate-700 dark:text-foreground">
          {total}
        </p>
      </CardHeader>
      <CardContent className="pb-8 pt-4">
        <div className="mx-auto mt-2 h-[23rem] w-[23rem] max-w-full">
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
                          <span className="font-medium tabular-nums">{Number(chartValue).toLocaleString()}</span>
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
                innerRadius={110}
                outerRadius={145}
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
                            y={(viewBox.cy || 0) - 10}
                            className="fill-slate-900 text-[28px] font-semibold dark:fill-foreground"
                          >
                            {centerLabel}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 42}
                            className="fill-slate-900 text-[30px] font-bold dark:fill-foreground"
                          >
                            {centerValue}
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
    innerRadius = 102,
    outerRadius = 145,
    startAngle = 0,
    endAngle = 0,
    fill,
    midAngle = 0,
  } = props;

  const radians = (-midAngle * Math.PI) / 180;
  const offsetX = Math.cos(radians) * 16;
  const offsetY = Math.sin(radians) * 16;

  return (
    <g>
      <Sector
        cx={cx + offsetX}
        cy={cy + offsetY}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx + offsetX}
        cy={cy + offsetY}
        innerRadius={outerRadius + 12}
        outerRadius={outerRadius + 18}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        opacity={0.3}
      />
    </g>
  );
}

