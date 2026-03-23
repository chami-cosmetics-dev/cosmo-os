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
      const normalizeOrders = (orders: OrdersPageDataResponse["orders"]): LiveOrder[] =>
        (orders ?? []).map((order) => ({
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

      const firstParams = new URLSearchParams({
        page: "1",
        limit: String(pageSize),
        sort_by: "created",
        sort_order: "desc",
      });

      const firstResponse = await fetch(`/api/admin/orders/page-data?${firstParams.toString()}`, {
        cache: "no-store",
      });
      if (!firstResponse.ok) {
        throw new Error("Failed to fetch live dashboard data");
      }

      const firstData = (await firstResponse.json()) as OrdersPageDataResponse;
      const total = firstData.total ?? 0;
      const collected = normalizeOrders(firstData.orders);

      // Render quickly with first page, then enrich with remaining pages.
      setLiveOrders(collected);
      setLiveLoaded(true);

      const totalPages = Math.min(maxPages, Math.max(1, Math.ceil(total / pageSize)));
      if (totalPages > 1) {
        const pageRequests: Promise<LiveOrder[]>[] = [];
        for (let page = 2; page <= totalPages; page += 1) {
          const params = new URLSearchParams({
            page: String(page),
            limit: String(pageSize),
            sort_by: "created",
            sort_order: "desc",
          });
          pageRequests.push(
            fetch(`/api/admin/orders/page-data?${params.toString()}`, { cache: "no-store" })
              .then(async (response) => {
                if (!response.ok) return [];
                const data = (await response.json()) as OrdersPageDataResponse;
                return normalizeOrders(data.orders);
              })
              .catch(() => [])
          );
        }

        const restPages = await Promise.all(pageRequests);
        const merged = collected.concat(...restPages);
        setLiveOrders(merged);
      }

      setLastUpdatedAt(new Date().toISOString());
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
    <DashboardOverviewProvider>
      <section className="space-y-5">
        <DashboardFiltersSlot />
        <DashboardMainSlot />
      </section>
    </DashboardOverviewProvider>
  );
}
