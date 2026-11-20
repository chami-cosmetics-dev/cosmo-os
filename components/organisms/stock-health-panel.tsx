"use client";

import { useState } from "react";
import { HeartPulse } from "lucide-react";

import { StockHealthDashboardCard } from "@/components/organisms/stock-health-dashboard";
import { StockHealthExcludedSkusCard } from "@/components/organisms/stock-health-excluded-skus";
import {
  StockHealthOutOfStockCard,
  type StockHealthOutOfStockFilter,
} from "@/components/organisms/stock-health-out-of-stock";
import { StockHealthRopDetailsCard } from "@/components/organisms/stock-health-rop-details";
import { StockHealthRopStatusCard } from "@/components/organisms/stock-health-rop-status";
import { StockHealthWeeklySummaryCard } from "@/components/organisms/stock-health-weekly-summary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  STOCK_HEALTH_TAB_LABELS,
  STOCK_HEALTH_TABS,
  type StockHealthStatus,
  type StockHealthTab,
} from "@/lib/stock-health/config";
import type { StockHealthRopGroup } from "@/lib/stock-health/calc";
import {
  DEFAULT_ROP_DETAILS_FILTERS,
  type RopDetailsFilters,
} from "@/lib/stock-health/rop-details";

export function StockHealthPanel({ canManageExcludedSkus }: { canManageExcludedSkus: boolean }) {
  const [tab, setTab] = useState<StockHealthTab>("dashboard");
  // Bumped when the excluded SKUs change, so the tables reload.
  const [reloadKey, setReloadKey] = useState(0);
  // Bumped after one table's Refresh rebuilt the shared ERP data, so the other shows it too.
  const [weeklyReloadKey, setWeeklyReloadKey] = useState(0);
  const [ropReloadKey, setRopReloadKey] = useState(0);
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);
  const [outOfStockFilter, setOutOfStockFilter] = useState<StockHealthOutOfStockFilter>("all");
  const [ropDetailsFilters, setRopDetailsFilters] = useState<RopDetailsFilters>(
    DEFAULT_ROP_DETAILS_FILTERS,
  );

  // Opening Out of Stock / ROP Details from its tab shows All; a ROP Status number sets its own
  // filters.
  const openTab = (next: StockHealthTab) => {
    setTab(next);
    if (next === "out_of_stock") setOutOfStockFilter("all");
    if (next === "rop_details") setRopDetailsFilters(DEFAULT_ROP_DETAILS_FILTERS);
  };

  // A ROP Status / Dashboard number opens its tab filtered to it.
  const openOutOfStock = (status: StockHealthStatus | null) => {
    setOutOfStockFilter(status ?? "all");
    setTab("out_of_stock");
  };
  const openRopDetails = (status: StockHealthStatus | null, group: StockHealthRopGroup | null) => {
    setRopDetailsFilters({
      ...DEFAULT_ROP_DETAILS_FILTERS,
      priority: status ?? "all",
      status: group ?? "all",
    });
    setTab("rop_details");
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <HeartPulse className="h-8 w-8 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock Health</h1>
          <p className="text-sm text-muted-foreground">
            Stock summary and out-of-stock items.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => openTab(value as StockHealthTab)}>
        <TabsList className="h-auto w-full justify-start gap-1 sm:w-fit">
          {STOCK_HEALTH_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {STOCK_HEALTH_TAB_LABELS[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* forceMount keeps each tab's loaded data when switching; hidden while inactive. */}
        <TabsContent value="dashboard" forceMount className="mt-4 data-[state=inactive]:hidden">
          <StockHealthDashboardCard
            reloadKey={reloadKey + dashboardReloadKey}
            onRefreshed={() => {
              setWeeklyReloadKey((key) => key + 1);
              setRopReloadKey((key) => key + 1);
            }}
            onOpenRopDetails={openRopDetails}
            onOpenOutOfStock={openOutOfStock}
          />
        </TabsContent>

        <TabsContent value="summary" forceMount className="mt-4 space-y-6 data-[state=inactive]:hidden">
          <StockHealthWeeklySummaryCard
            reloadKey={reloadKey + weeklyReloadKey}
            onRefreshed={() => {
              setRopReloadKey((key) => key + 1);
              setDashboardReloadKey((key) => key + 1);
            }}
          />
          <StockHealthRopStatusCard
            reloadKey={reloadKey + ropReloadKey}
            onRefreshed={() => {
              setWeeklyReloadKey((key) => key + 1);
              setDashboardReloadKey((key) => key + 1);
            }}
            onOpenOutOfStock={openOutOfStock}
            onOpenRopDetails={openRopDetails}
          />
          <StockHealthExcludedSkusCard
            canManage={canManageExcludedSkus}
            onChange={() => setReloadKey((key) => key + 1)}
          />
        </TabsContent>

        <TabsContent value="out_of_stock" forceMount className="mt-4 data-[state=inactive]:hidden">
          <StockHealthOutOfStockCard
            reloadKey={reloadKey + weeklyReloadKey + ropReloadKey}
            filter={outOfStockFilter}
            onFilterChange={setOutOfStockFilter}
          />
        </TabsContent>

        <TabsContent value="rop_details" forceMount className="mt-4 data-[state=inactive]:hidden">
          <StockHealthRopDetailsCard
            reloadKey={reloadKey + weeklyReloadKey + ropReloadKey}
            filters={ropDetailsFilters}
            onFiltersChange={setRopDetailsFilters}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
