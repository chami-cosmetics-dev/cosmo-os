"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DashboardSalesCharts } from "@/components/organisms/dashboard-sales-charts";
import { DashboardSummaryCharts } from "@/components/organisms/dashboard-summary-charts";

interface DashboardStatsProps {
  stats: {
    shop: string;
    total: string;
    agent: string;
    agentValue: string;
    invoiceCount?: number;
    orderDate: string;
    completedDate: string;
    footer?: string;
    segments: Array<{
      value: number;
      color: string;
    }>;
  }[];
}

type OrdersPageDataResponse = {
  orders: Array<{
    id: string;
    totalPrice: string;
    createdAt: string;
    sourceName: string;
    fulfillmentStage?: string | null;
    companyLocation: { id: string; name: string } | null;
    assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  }>;
  total: number;
  page: number;
  limit: number;
};

type LiveOrder = {
  id: string;
  totalPrice: number;
  createdAt: string;
  sourceName: string;
  fulfillmentStage: string | null;
  locationName: string;
  merchantName: string;
};

export function DashboardStats({ stats }: DashboardStatsProps) {
  const initialRange = getInitialRange(stats);
  const [fromDate, setFromDate] = useState(initialRange.fromDate);
  const [toDate, setToDate] = useState(initialRange.toDate);
  const [dateType, setDateType] = useState<"order" | "completed">("order");
  const [analysisType, setAnalysisType] = useState<"merchant" | "gateway">("merchant");
  const [liveOrders, setLiveOrders] = useState<LiveOrder[]>([]);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const hasInvalidRange = new Date(fromDate) > new Date(toDate);

  const refreshLiveData = useCallback(async () => {
    setRefreshing(true);
    setLiveError(null);
    try {
      const pageSize = 100;
      const maxPages = 12;
      let page = 1;
      let total = 0;
      const collected: LiveOrder[] = [];

      do {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(pageSize),
          sort_by: "created",
          sort_order: "desc",
        });

        const response = await fetch(`/api/admin/orders/page-data?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Failed to fetch live dashboard data");
        }

        const data = (await response.json()) as OrdersPageDataResponse;
        total = data.total ?? 0;

        const normalized = (data.orders ?? []).map((order) => ({
          id: order.id,
          totalPrice: Number(order.totalPrice) || 0,
          createdAt: order.createdAt,
          sourceName: order.sourceName,
          fulfillmentStage: order.fulfillmentStage ?? null,
          locationName: order.companyLocation?.name ?? "Unknown Location",
          merchantName:
            order.assignedMerchant?.name ??
            order.assignedMerchant?.email ??
            "Unassigned",
        }));
        collected.push(...normalized);
        page += 1;

        if (page > maxPages) break;
      } while ((page - 1) * pageSize < total);

      setLiveOrders(collected);
      setLastUpdatedAt(new Date().toISOString());
      setLiveLoaded(true);
    } catch {
      setLiveError("Live data unavailable.");
      setLiveLoaded(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshLiveData();
  }, [refreshLiveData]);

  const displayedStats = useMemo<DashboardStatsProps["stats"]>(() => {
    if (hasInvalidRange) return [];
    if (!liveLoaded) return [];
    if (liveOrders.length === 0) return [];

    const from = toStartOfDay(fromDate);
    const to = toEndOfDay(toDate);
    const filteredOrders = liveOrders.filter((order) => {
      if (
        dateType === "completed" &&
        order.fulfillmentStage !== "delivery_complete" &&
        order.fulfillmentStage !== "invoice_complete"
      ) {
        return false;
      }
      const current = new Date(order.createdAt);
      return current >= from && current <= to;
    });

    return analysisType === "merchant"
      ? aggregateMerchantStats(filteredOrders)
      : aggregateGatewayStats(filteredOrders);
  }, [analysisType, dateType, fromDate, hasInvalidRange, liveLoaded, liveOrders, toDate]);

  function resetFilters() {
    setFromDate(initialRange.fromDate);
    setToDate(initialRange.toDate);
    setDateType("order");
    setAnalysisType("merchant");
  }

  return (
    <section className="space-y-5">
      <Card className="border-border/70 bg-card shadow-xs">
        <CardHeader className="space-y-1 border-b pb-4">
          <p className="text-sm font-semibold tracking-wide">Filters</p>
          <p className="text-muted-foreground text-sm">
            Adjust date range, date source, and analysis mode for dashboard results.
          </p>
        </CardHeader>
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
            <div className="bg-muted/20 flex h-10 items-center gap-6 rounded-md border border-border px-3 text-sm">
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
            <div className="bg-muted/20 flex h-10 items-center gap-6 rounded-md border border-border px-3 text-sm">
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
            className="h-10 w-10 justify-self-start rounded-md bg-primary text-primary-foreground"
            onClick={refreshLiveData}
            aria-label="Refresh live data"
            disabled={refreshing}
          >
            <RefreshCw className={`size-5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </CardContent>
        <div className="border-t border-border/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <PresetButton
              label="All Dates"
              isActive={fromDate === initialRange.fromDate && toDate === initialRange.toDate}
              onClick={() => {
                setFromDate(initialRange.fromDate);
                setToDate(initialRange.toDate);
              }}
            />
            <PresetButton
              label="Last 3 Days"
              isActive={
                fromDate === shiftDate(initialRange.toDate, -2) &&
                toDate === initialRange.toDate
              }
              onClick={() => {
                setFromDate(shiftDate(initialRange.toDate, -2));
                setToDate(initialRange.toDate);
              }}
            />
            <PresetButton
              label="Last 7 Days"
              isActive={
                fromDate === shiftDate(initialRange.toDate, -6) &&
                toDate === initialRange.toDate
              }
              onClick={() => {
                setFromDate(shiftDate(initialRange.toDate, -6));
                setToDate(initialRange.toDate);
              }}
            />
            <span className="text-muted-foreground ml-auto text-xs">
              {liveLoaded ? `Showing ${displayedStats.length}` : "Loading live data..."}
            </span>
          </div>
          {hasInvalidRange && (
            <p className="mt-2 text-xs text-red-500">
              From date must be earlier than or equal to To date.
            </p>
          )}
          {liveError && <p className="mt-2 text-xs text-amber-600">{liveError}</p>}
          {liveOrders.length > 0 && (
            <p className="text-muted-foreground mt-2 text-xs">Live snapshot enabled (manual refresh)</p>
          )}
          {lastUpdatedAt && (
            <p className="text-muted-foreground mt-1 text-xs">
              Last updated: {new Date(lastUpdatedAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      </Card>

     

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
          <span className="text-muted-foreground ml-1">
            {displayedStats.length} merchants
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {displayedStats.map((stat) => (
          <Card
            key={stat.shop}
            className="rounded-xl border border-border/70 bg-card shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <CardHeader className="space-y-1 py-3 text-center">
              <p className="text-base leading-6 font-semibold tracking-tight">
                {stat.shop}
              </p>
              <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
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

      {liveLoaded && displayedStats.length === 0 && (
        <Card className="border-border/70 bg-card shadow-xs">
          <CardContent className="py-8 text-center text-sm">
            <p className="text-muted-foreground">
              No chart data found for the selected filters.
            </p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={resetFilters}
            >
              Clear Filters
            </Button>
          </CardContent>
        </Card>
      )}

      <DashboardSummaryCharts
        analysisType={analysisType}
        stats={displayedStats}
      />

      <DashboardSalesCharts
        stats={displayedStats}
        dateType={dateType}
      />
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

function PresetButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={isActive ? "default" : "outline"}
      size="sm"
      className="h-7 text-xs"
      onClick={onClick}
    >
      {label}
    </Button>
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

function getInitialRange(stats: DashboardStatsProps["stats"]) {
  if (stats.length === 0) {
    return { fromDate: "2026-02-26", toDate: "2026-02-26" };
  }

  const allDates = stats.flatMap((stat) => [stat.orderDate, stat.completedDate]).sort();
  return { fromDate: allDates[0], toDate: allDates[allDates.length - 1] };
}

function shiftDate(dateValue: string, days: number) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function aggregateMerchantStats(orders: LiveOrder[]): DashboardStatsProps["stats"] {
  const byLocation = new Map<
    string,
    {
      total: number;
      merchants: Map<string, number>;
      count: number;
      minDate: string;
      maxDate: string;
    }
  >();

  for (const order of orders) {
    const currentDate = order.createdAt.slice(0, 10);
    const existing = byLocation.get(order.locationName);
    if (!existing) {
      byLocation.set(order.locationName, {
        total: order.totalPrice,
        merchants: new Map([[order.merchantName, order.totalPrice]]),
        count: 1,
        minDate: currentDate,
        maxDate: currentDate,
      });
      continue;
    }

    existing.total += order.totalPrice;
    existing.count += 1;
    existing.minDate = existing.minDate < currentDate ? existing.minDate : currentDate;
    existing.maxDate = existing.maxDate > currentDate ? existing.maxDate : currentDate;
    existing.merchants.set(
      order.merchantName,
      (existing.merchants.get(order.merchantName) ?? 0) + order.totalPrice,
    );
  }

  return Array.from(byLocation.entries())
    .map(([location, data]) => {
      const merchantPairs = Array.from(data.merchants.entries()).sort((a, b) => b[1] - a[1]);
      const topMerchant = merchantPairs[0] ?? ["Unassigned", 0];
      return {
        shop: location,
        total: formatMoney(data.total),
        agent: topMerchant[0],
        agentValue: formatMoney(topMerchant[1]),
        invoiceCount: data.count,
        orderDate: data.minDate,
        completedDate: data.maxDate,
        segments: buildSegmentsFromPairs(merchantPairs),
      };
    })
    .sort((a, b) => parseNumber(b.total) - parseNumber(a.total));
}

function aggregateGatewayStats(orders: LiveOrder[]): DashboardStatsProps["stats"] {
  const bySource = new Map<
    string,
    {
      total: number;
      locations: Map<string, number>;
      count: number;
      minDate: string;
      maxDate: string;
    }
  >();

  for (const order of orders) {
    const currentDate = order.createdAt.slice(0, 10);
    const gateway = order.sourceName?.toUpperCase() || "UNKNOWN";
    const existing = bySource.get(gateway);
    if (!existing) {
      bySource.set(gateway, {
        total: order.totalPrice,
        locations: new Map([[order.locationName, order.totalPrice]]),
        count: 1,
        minDate: currentDate,
        maxDate: currentDate,
      });
      continue;
    }

    existing.total += order.totalPrice;
    existing.count += 1;
    existing.minDate = existing.minDate < currentDate ? existing.minDate : currentDate;
    existing.maxDate = existing.maxDate > currentDate ? existing.maxDate : currentDate;
    existing.locations.set(
      order.locationName,
      (existing.locations.get(order.locationName) ?? 0) + order.totalPrice,
    );
  }

  return Array.from(bySource.entries())
    .map(([source, data]) => {
      const locationPairs = Array.from(data.locations.entries()).sort((a, b) => b[1] - a[1]);
      const topLocation = locationPairs[0] ?? ["Unknown", 0];
      return {
        shop: `${source} Gateway`,
        total: formatMoney(data.total),
        agent: topLocation[0],
        agentValue: formatMoney(topLocation[1]),
        invoiceCount: data.count,
        orderDate: data.minDate,
        completedDate: data.maxDate,
        segments: buildSegmentsFromPairs(locationPairs),
      };
    })
    .sort((a, b) => parseNumber(b.total) - parseNumber(a.total));
}

function buildSegmentsFromPairs(pairs: Array<[string, number]>) {
  const total = pairs.reduce((sum, current) => sum + current[1], 0) || 1;
  const palette = ["#4f95bf", "#06b06c", "#f06a57"];
  const topThree = pairs.slice(0, 3).map(([, value], index) => ({
    value: Math.max(1, Math.round((value / total) * 100)),
    color: palette[index],
  }));

  if (topThree.length === 1) {
    return [{ value: 100, color: palette[0] }];
  }
  return topThree;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(value);
}

function parseNumber(value: string) {
  return Number(value.replace(/,/g, "")) || 0;
}

function toStartOfDay(dateValue: string) {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toEndOfDay(dateValue: string) {
  const date = new Date(dateValue);
  date.setHours(23, 59, 59, 999);
  return date;
}
