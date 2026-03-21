"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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

type StatRow = {
  shop: string;
  total: string;
  agent: string;
  agentValue: string;
  invoiceCount?: number;
};

interface DashboardShopwiseBarChartProps {
  stats: StatRow[];
  analysisType: "merchant" | "gateway";
}

function parseMetric(value: string) {
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function DashboardShopwiseBarChart({
  stats,
  analysisType,
}: DashboardShopwiseBarChartProps) {
  const chartData = useMemo(
    () =>
      stats.map((s) => ({
        name: s.shop,
        nameShort: s.shop.length > 36 ? `${s.shop.slice(0, 34)}…` : s.shop,
        value: parseMetric(s.total),
        orders: s.invoiceCount ?? 0,
        agent: s.agent,
      })),
    [stats],
  );

  const title =
    analysisType === "merchant"
      ? "Sales by branch (location)"
      : "Sales by payment gateway";
  const description =
    analysisType === "merchant"
      ? "Total sales in the selected period, grouped by shop / location."
      : "Total sales in the selected period, grouped by gateway.";

  const chartHeight = Math.min(640, Math.max(280, chartData.length * 48));

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <div style={{ height: chartHeight }} className="w-full min-h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              accessibilityLayer
              data={chartData}
              layout="vertical"
              margin={{ right: 12, left: 4, top: 8, bottom: 8 }}
            >
              <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
              <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} hide />
              <XAxis dataKey="value" type="number" hide />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as (typeof chartData)[number];
                  return (
                    <div className="border-border/70 bg-card rounded-md border px-3 py-2 text-sm shadow-md">
                      <p className="font-medium">{row.name}</p>
                      <p className="text-muted-foreground mt-1">
                        Total: <span className="text-foreground font-semibold">{formatCompact(row.value)}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Orders: <span className="text-foreground">{row.orders}</span>
                      </p>
                      <p className="text-muted-foreground">
                        {analysisType === "merchant" ? "Leading merchant" : "Leading branch"}:{" "}
                        <span className="text-foreground">{row.agent}</span>
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="value"
                layout="vertical"
                fill="var(--chart-1)"
                radius={[0, 4, 4, 0]}
                maxBarSize={40}
              >
                <LabelList
                  dataKey="nameShort"
                  position="insideLeft"
                  offset={8}
                  className="fill-white drop-shadow-sm"
                  style={{ fontSize: 12 }}
                />
                <LabelList
                  dataKey="value"
                  position="right"
                  offset={8}
                  className="fill-foreground"
                  style={{ fontSize: 12 }}
                  formatter={(v: number) => formatCompact(v)}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
