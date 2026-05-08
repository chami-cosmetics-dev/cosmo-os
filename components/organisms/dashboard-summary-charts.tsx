"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";

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
  "#3f8fc1",
  "#f06a57",
  "#06b06c",
  "#f59e0b",
  "#c4c9d3",
  "#0ea5e9",
  "#ef4444",
  "#84cc16",
  "#a3a3a3",
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
    remainder > 0 ? [...agentTotals, { value: remainder, color: "#c4c9d3" }] : agentTotals;

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
  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="space-y-1 border-t-2 border-border py-3 text-center">
        <p className="text-sm leading-5 font-semibold tracking-wide">{title}</p>
        <p className="text-2xl font-semibold tracking-tight">{total}</p>
      </CardHeader>
      <CardContent className="pb-5">
        <div className="relative mx-auto mt-1 grid h-56 w-56 place-items-center sm:h-64 sm:w-64">
          <div
            className="absolute inset-3 rounded-full"
            style={{ background: toConicGradient(segments) }}
          />
          <div className="relative z-10 grid h-[9.5rem] w-[9.5rem] place-items-center rounded-full bg-card p-4 text-center shadow-[0_0_0_2px_hsl(var(--border))] sm:h-[10rem] sm:w-[10rem]">
            <div>
              <p className={getCenterLabelClass(centerLabel)}>{centerLabel}</p>
              <p className="text-3xl font-medium">{centerValue}</p>
            </div>
          </div>
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

function getCenterLabelClass(label: string) {
  if (label.length > 20) return "text-xs leading-tight font-semibold";
  if (label.length > 14) return "text-lg leading-tight font-semibold";
  return "text-2xl leading-tight font-semibold";
}

function toConicGradient(segments: Array<{ value: number; color: string }>) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let start = 0;
  const stops = segments.map((segment) => {
    const sweep = (segment.value / total) * 360;
    const gap = Math.min(1.2, sweep / 8);
    const stop = `${segment.color} ${(start + gap).toFixed(2)}deg ${(start + sweep - gap).toFixed(2)}deg`;
    start += sweep;
    return stop;
  });
  return `conic-gradient(${stops.join(", ")})`;
}
