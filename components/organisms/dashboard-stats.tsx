"use client";

import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface DashboardStatsProps {
  stats: {
    shop: string;
    total: string;
    agent: string;
    agentValue: string;
    orderDate: string;
    completedDate: string;
    footer?: string;
    segments: Array<{
      value: number;
      color: string;
    }>;
  }[];
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const [fromDate, setFromDate] = useState("2026-02-26");
  const [toDate, setToDate] = useState("2026-02-26");
  const [dateType, setDateType] = useState<"order" | "completed">("order");
  const [analysisType, setAnalysisType] = useState<"merchant" | "gateway">("merchant");

  const displayedStats = useMemo(() => {
    const normalized = analysisType === "merchant" ? stats : toGatewayStats(stats);
    const from = new Date(fromDate);
    const to = new Date(toDate);

    return normalized.filter((stat) => {
      const dateValue = dateType === "order" ? stat.orderDate : stat.completedDate;
      const current = new Date(dateValue);
      return current >= from && current <= to;
    });
  }, [analysisType, dateType, fromDate, stats, toDate]);

  function resetFilters() {
    setFromDate("2026-02-26");
    setToDate("2026-02-26");
    setDateType("order");
    setAnalysisType("merchant");
  }

  return (
    <section className="space-y-4">
      <Card className="border-border/70 bg-card shadow-xs">
        <CardContent className="border-primary/55 grid gap-4 border-t-4 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1.4fr_auto]">
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              From Date
            </p>
            <Input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-10 rounded-sm border-border bg-background"
            />
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              To Date
            </p>
            <Input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-10 rounded-sm border-border bg-background"
            />
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Date Type
            </p>
            <div className="flex h-10 items-center gap-6 rounded-sm border border-border px-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={dateType === "order"}
                  onChange={() => setDateType("order")}
                />
                <span>Order Date</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={dateType === "completed"}
                  onChange={() => setDateType("completed")}
                />
                <span>Completed Date</span>
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Analysis Type
            </p>
            <div className="flex h-10 items-center gap-6 rounded-sm border border-border px-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={analysisType === "merchant"}
                  onChange={() => setAnalysisType("merchant")}
                />
                <span>Merchant Wise</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={analysisType === "gateway"}
                  onChange={() => setAnalysisType("gateway")}
                />
                <span>Payment Gateway Wise</span>
              </label>
            </div>
          </div>
          <Button
            size="icon"
            className="h-10 w-10 justify-self-start bg-primary text-primary-foreground"
            onClick={resetFilters}
            aria-label="Reset filters"
          >
            <RefreshCw className="size-5" />
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 rounded-lg border border-border/60 bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
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
          <span className="text-muted-foreground ml-1">
            {displayedStats.length} merchants
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {displayedStats.map((stat) => (
          <Card
            key={stat.shop}
            className="rounded-sm border border-border/70 bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <CardHeader className="space-y-0 py-2 text-center">
              <p className="text-base leading-6 font-semibold tracking-tight">
                {stat.shop}
              </p>
              <p className="text-muted-foreground text-xs uppercase">
                Total Orders
              </p>
              <p className="text-2xl font-semibold">{stat.total}</p>
            </CardHeader>
            <CardContent className="pb-5">
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
                    <p className="text-muted-foreground">
                      {getSegmentLabel(index)}
                    </p>
                    <p className="font-medium">{segment.value}%</p>
                  </div>
                ))}
              </div>
              {stat.footer && (
                <p className="text-muted-foreground mt-3 text-center text-xs">
                  {stat.footer}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {displayedStats.length === 0 && (
        <Card className="border-border/70 bg-card">
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            No chart data found for the selected filters.
          </CardContent>
        </Card>
      )}
    </section>
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
          <p className="text-muted-foreground text-[11px] uppercase">
            Primary Agent
          </p>
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

function toGatewayStats(
  merchantStats: DashboardStatsProps["stats"],
): DashboardStatsProps["stats"] {
  const gateways = [
    "Card Payments",
    "Cash On Delivery",
    "LankaQR",
    "Bank Transfer",
    "Koko",
    "MintPay",
    "Frimi",
    "PayHere",
  ];

  return merchantStats.map((stat, index) => ({
    ...stat,
    shop: gateways[index % gateways.length],
    footer: undefined,
  }));
}
