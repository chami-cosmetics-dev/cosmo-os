"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { DashboardLocationStackedHorizontalChart } from "@/components/organisms/dashboard-location-stacked-horizontal-chart";

export type LocationMerchantChartRow = {
  merchantName: string;
  total: number;
  orderCount: number;
};

interface DashboardLocationMerchantChartsProps {
  locations: Array<{
    id: string;
    name: string;
    merchants: LocationMerchantChartRow[];
  }>;
  dateType: "order" | "completed";
  /** Active dashboard filters (date range + date source), shown in chart copy. */
  filterInfo: string;
  /** Labels and copy for merchant vs payment gateway breakdown (same data shape). */
  breakdownVariant?: "merchant" | "gateway";
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

const chartConfig = {
  value: {
    label: "Sales total",
    color: "var(--chart-1)",
  },
  label: {
    color: "var(--background)",
  },
} satisfies ChartConfig;

export function DashboardLocationMerchantCharts({
  locations,
  dateType,
  filterInfo,
  breakdownVariant = "merchant",
}: DashboardLocationMerchantChartsProps) {
  const isGateway = breakdownVariant === "gateway";
  const segmentNoun = isGateway ? "payment gateway" : "merchant";

  const dateHint = `${filterInfo} · ${
    dateType === "order"
      ? "Orders counted by invoice date in the selected range."
      : "Orders counted by invoice completed at in the selected range."
  }`;

  if (locations.length === 0) {
    return (
      <Card className="border-border/70 bg-card shadow-xs">
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-lg">
            {isGateway ? "Sales by payment gateway" : "Sales by merchant"}
          </CardTitle>
          <CardDescription className="space-y-1">
            <span className="text-foreground/90 block text-sm font-medium">{filterInfo}</span>
            <span className="block">
              {dateType === "order"
                ? "Orders counted by invoice date in the selected range."
                : "Orders counted by invoice completed at in the selected range."}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          No locations found for your company.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardLocationStackedHorizontalChart
        locations={locations}
        dateHint={dateHint}
        breakdownVariant={breakdownVariant}
      />
      <Card className="border-border/70 bg-card shadow-xs">
        <CardContent className="pt-2 pb-4">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="location-charts" className="border-0">
              <AccordionTrigger className="hover:no-underline data-[state=open]:pb-2">
                <div className="flex flex-col items-start gap-1 pr-2 text-left">
                  <span className="text-lg font-semibold">
                    Location-wise {segmentNoun} charts
                  </span>
                  <span className="text-muted-foreground text-sm font-normal">
                    {locations.length} location{locations.length === 1 ? "" : "s"} · expand to see
                    sales by {segmentNoun}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 gap-6 pt-2 sm:grid-cols-2 lg:grid-cols-3">
                  {locations.map((loc) => (
                    <div key={loc.id} className="min-w-0">
                      <LocationMerchantBarCard
                        locationName={loc.name}
                        merchants={loc.merchants}
                        dateHint={dateHint}
                        segmentLabel={isGateway ? "Payment gateway" : "Merchant"}
                      />
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

function LocationMerchantBarCard({
  locationName,
  merchants,
  dateHint,
  segmentLabel,
}: {
  locationName: string;
  merchants: LocationMerchantChartRow[];
  dateHint: string;
  segmentLabel: string;
}) {
  const chartData = useMemo(
    () =>
      merchants.map((m) => ({
        name: m.merchantName,
        nameShort:
          m.merchantName.length > 36 ? `${m.merchantName.slice(0, 34)}…` : m.merchantName,
        value: m.total,
        orders: m.orderCount,
      })),
    [merchants],
  );

  const chartHeight = Math.min(560, Math.max(220, chartData.length * 44));

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-lg">{locationName}</CardTitle>
        <CardDescription>
          Sales total by {segmentLabel.toLowerCase()} · {dateHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {chartData.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No orders in this period for this location.
          </p>
        ) : (
          <div style={{ height: chartHeight }} className="w-full min-h-[220px]">
            <ChartContainer config={chartConfig} className="aspect-auto h-full w-full">
              <BarChart
                accessibilityLayer
                data={chartData}
                layout="vertical"
                margin={{ right: 16, left: 4, top: 8, bottom: 8 }}
              >
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  hide
                />
                <XAxis dataKey="value" type="number" hide />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      formatter={(value, _name, item) => {
                        const row = item?.payload as {
                          name: string;
                          orders: number;
                          value: number;
                        };
                        return (
                          <div className="flex w-full flex-col gap-1">
                            <span className="font-medium">{row?.name}</span>
                            <span className="text-muted-foreground text-xs">
                              Orders: {row?.orders}
                            </span>
                            <span className="font-medium tabular-nums">
                              {formatCompact(Number(value ?? row?.value ?? 0))}
                            </span>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="value"
                  layout="vertical"
                  fill="var(--color-value)"
                  radius={4}
                  maxBarSize={40}
                >
                  <LabelList
                    dataKey="nameShort"
                    position="insideLeft"
                    offset={8}
                    className="fill-(--color-label)"
                    fontSize={12}
                  />
                  <LabelList
                    dataKey="value"
                    position="right"
                    offset={8}
                    className="fill-foreground"
                    fontSize={12}
                    formatter={(v: number) => formatCompact(v)}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
