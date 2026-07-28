"use client";

import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";
import { formatAppIsoCalendarDate } from "@/lib/format-datetime";

const DASHBOARD_LOCALE = "en-LK";
const DASHBOARD_TIME_ZONE = "Asia/Colombo";

function shiftDate(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatAppIsoCalendarDate(date);
}

function getMonthStart(dateValue: string) {
  const [year, month] = dateValue.split("-");
  return `${year}-${month}-01`;
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

/** Parallel route `@filters` — date range and analysis controls (client). */
export function DashboardFiltersSlot() {
  const {
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    dateType,
    setDateType,
    analysisType,
    setAnalysisType,
    initialRange,
    hasInvalidRange,
    refreshSales,
    salesLoading,
    lastUpdatedAt,
  } = useDashboardOverview();

  const lastUpdatedLabel = lastUpdatedAt
    ? new Intl.DateTimeFormat(DASHBOARD_LOCALE, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: DASHBOARD_TIME_ZONE,
      }).format(new Date(lastUpdatedAt))
    : "Waiting for first refresh";

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="space-y-1 border-b pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold tracking-wide">Filters</p>
            <p className="text-muted-foreground text-sm">
              Adjust date range, date source, and analysis mode for dashboard results.
            </p>
            <p className="text-muted-foreground text-xs">
              Background refresh every 60 seconds. Last updated: {lastUpdatedLabel}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 self-start"
            onClick={() => void refreshSales()}
            disabled={salesLoading || hasInvalidRange}
          >
            {salesLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="border-primary/55 grid gap-4 border-t-4 p-4 md:grid-cols-2 xl:grid-cols-[0.7fr_0.7fr_2.2fr_1fr]">
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
          <div className="bg-muted/20 space-y-3 rounded-md border border-border px-3 py-2 text-sm">
            <div className="space-y-2">
              <p className="text-muted-foreground text-[11px] font-medium">
                Orders placed (add up)
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="flex items-center gap-2 whitespace-nowrap">
                  <input
                    type="radio"
                    checked={dateType === "placed_all"}
                    onChange={() => setDateType("placed_all")}
                  />
                  <span>Placed – all</span>
                </label>
                <label className="flex items-center gap-2 whitespace-nowrap">
                  <input
                    type="radio"
                    checked={dateType === "placed_open"}
                    onChange={() => setDateType("placed_open")}
                  />
                  <span>Placed – not delivered</span>
                </label>
                <label className="flex items-center gap-2 whitespace-nowrap">
                  <input
                    type="radio"
                    checked={dateType === "placed_pending_invoice"}
                    onChange={() => setDateType("placed_pending_invoice")}
                  />
                  <span>Placed – invoice pending</span>
                </label>
                <label className="flex items-center gap-2 whitespace-nowrap">
                  <input
                    type="radio"
                    checked={dateType === "placed_invoice_completed"}
                    onChange={() => setDateType("placed_invoice_completed")}
                  />
                  <span>Placed – invoice completed</span>
                </label>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Not delivered + Invoice pending + Invoice completed ≈ Placed – all
              </p>
            </div>
            <div className="space-y-2 border-t border-border/60 pt-2">
              <p className="text-muted-foreground text-[11px] font-medium">
                Other clocks (do not add to Placed)
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className="flex items-center gap-2 whitespace-nowrap">
                  <input
                    type="radio"
                    checked={dateType === "closed_in_period"}
                    onChange={() => setDateType("closed_in_period")}
                  />
                  <span>Closed in period</span>
                </label>
                <label className="flex items-center gap-2 whitespace-nowrap">
                  <input
                    type="radio"
                    checked={dateType === "delivered_all"}
                    onChange={() => setDateType("delivered_all")}
                  />
                  <span>Delivered in period – all</span>
                </label>
                <label className="flex items-center gap-2 whitespace-nowrap">
                  <input
                    type="radio"
                    checked={dateType === "delivered_pending_invoice"}
                    onChange={() => setDateType("delivered_pending_invoice")}
                  />
                  <span>Delivered in period – invoice pending</span>
                </label>
              </div>
            </div>
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
      </CardContent>
      <div className="border-t border-border/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <PresetButton
            label="Today"
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
          <PresetButton
            label="This Month"
            isActive={
              fromDate === getMonthStart(initialRange.toDate) &&
              toDate === initialRange.toDate
            }
            onClick={() => {
              setFromDate(getMonthStart(initialRange.toDate));
              setToDate(initialRange.toDate);
            }}
          />
        </div>
        {hasInvalidRange && (
          <p className="mt-2 text-xs text-red-500">
            From date must be earlier than or equal to To date.
          </p>
        )}
      </div>
    </Card>
  );
}
