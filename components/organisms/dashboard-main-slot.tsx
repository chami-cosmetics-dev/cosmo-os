"use client";

import { DashboardLocationMerchantCharts } from "@/components/organisms/dashboard-location-merchant-charts";
import { Card, CardContent } from "@/components/ui/card";

import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";

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
    <DashboardLocationMerchantCharts
      key={`${fromDate}-${toDate}-${dateType}-${analysisType}`}
      locations={salesLocations}
      dateType={dateType}
      filterInfo={filterInfo}
      breakdownVariant={analysisType === "gateway" ? "gateway" : "merchant"}
    />
  );
}
