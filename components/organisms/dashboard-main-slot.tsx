"use client";

import dynamic from "next/dynamic";

import { Card, CardContent } from "@/components/ui/card";

import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";

const DashboardSummaryCharts = dynamic(
  () =>
    import("@/components/organisms/dashboard-summary-charts").then((mod) => ({
      default: mod.DashboardSummaryCharts,
    })),
  {
    ssr: false,
    loading: () => <DashboardCardPlaceholder heightClassName="h-[22rem]" />,
  },
);

const DashboardSalesCharts = dynamic(
  () =>
    import("@/components/organisms/dashboard-sales-charts").then((mod) => ({
      default: mod.DashboardSalesCharts,
    })),
  {
    ssr: false,
    loading: () => <DashboardCardPlaceholder heightClassName="h-[28rem]" />,
  },
);

const DashboardLocationMerchantCharts = dynamic(
  () =>
    import("@/components/organisms/dashboard-location-merchant-charts").then((mod) => ({
      default: mod.DashboardLocationMerchantCharts,
    })),
  {
    ssr: false,
    loading: () => <DashboardLocationChartsPlaceholder />,
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
      <DashboardLocationMerchantCharts
        key={`${fromDate}-${toDate}-${dateType}-${analysisType}`}
        locations={salesLocations}
        dateType={dateType}
        filterInfo={filterInfo}
        breakdownVariant={analysisType === "gateway" ? "gateway" : "merchant"}
      />
    </div>
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
      <div className="from-background to-muted/20 flex flex-col gap-3 rounded-xl border border-border/60 bg-gradient-to-r p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
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
            className="rounded-xl border border-border/70 bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <CardContent className="pb-5">
              <div className="space-y-1 py-3 text-center">
                <p className="text-base leading-6 font-semibold tracking-tight">{stat.shop}</p>
                <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                  Total Orders
                </p>
                <p className="text-2xl font-semibold">{stat.total}</p>
              </div>
              <DonutChartCard
                name={stat.agent}
                value={stat.agentValue}
                segments={stat.segments}
              />
              <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[11px]">
                {stat.segments.map((segment, index) => (
                  <div
                    key={`${stat.shop}-${index}`}
                    className="rounded-md border border-border/60 px-1 py-1"
                  >
                    <div
                      className="mx-auto mb-1 h-1.5 w-8 rounded-full"
                      style={{ backgroundColor: segment.color }}
                    />
                    <p className="text-muted-foreground">{getSegmentLabel(index)}</p>
                    <p className="font-medium">{segment.value}%</p>
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

function DashboardCardPlaceholder({ heightClassName }: { heightClassName: string }) {
  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-2">
          <div className="bg-muted h-6 w-52 animate-pulse rounded" />
          <div className="bg-muted h-4 w-72 animate-pulse rounded" />
        </div>
        <div className={`bg-muted/60 w-full animate-pulse rounded-xl ${heightClassName}`} />
      </CardContent>
    </Card>
  );
}

function DashboardLocationChartsPlaceholder() {
  return (
    <div className="space-y-6">
      <DashboardCardPlaceholder heightClassName="h-[26rem]" />
      <Card className="border-border/70 bg-card shadow-xs">
        <CardContent className="space-y-4 pt-4 pb-4">
          <div className="space-y-2">
            <div className="bg-muted h-6 w-64 animate-pulse rounded" />
            <div className="bg-muted h-4 w-80 animate-pulse rounded" />
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="bg-muted/60 h-[22rem] animate-pulse rounded-xl border border-border/60"
              />
            ))}
          </div>
        </CardContent>
      </Card>
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
  return (
    <div className="relative mx-auto mt-1 grid h-56 w-56 place-items-center">
      <div
        className="absolute inset-3 rounded-full"
        style={{ background: toConicGradient(segments) }}
      />
      <div className="relative z-10 grid h-[9.25rem] w-[9.25rem] place-items-center rounded-full bg-card p-4 text-center shadow-[0_0_0_2px_#4f95bf]">
        <div>
          <p className="text-muted-foreground text-[11px] uppercase">Primary Agent</p>
          <p className={getNameClass(name)}>{name}</p>
          <p className="mt-1 text-3xl font-medium">{value}</p>
        </div>
      </div>
    </div>
  );
}

function getNameClass(name: string) {
  if (name.length > 18) return "text-sm leading-tight font-semibold";
  if (name.length > 12) return "text-xl leading-tight font-semibold";
  return "text-xl leading-tight font-semibold";
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

function toConicGradient(segments: Array<{ value: number; color: string }>) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  let start = 0;

  const stops = segments.map((segment) => {
    const sweep = (segment.value / total) * 360;
    const startWithGap = start + 1.5;
    const endWithGap = start + sweep - 1.5;
    const stop = `${segment.color} ${startWithGap.toFixed(2)}deg ${endWithGap.toFixed(2)}deg`;
    start += sweep;
    return stop;
  });

  return `conic-gradient(${stops.join(", ")})`;
}
