"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";
import { getAllowedDashboardDateTypes } from "@/lib/dashboard-date-type-permissions";
import { formatAppIsoCalendarDate } from "@/lib/format-datetime";
import {
  getDashboardSalesDateTypeLabel,
  type DashboardSalesDateType,
} from "@/lib/page-data/dashboard-overview-shared";

const DASHBOARD_LOCALE = "en-LK";
const DASHBOARD_TIME_ZONE = "Asia/Colombo";

const GROUP_A_KEYS = [
  "all_orders",
  "not_delivered",
  "bill_done_early",
  "bill_open",
  "done_after_delivery",
] as const satisfies readonly DashboardSalesDateType[];

const GROUP_B_KEYS = [
  "bill_done_in_dates",
  "delivered_in_dates",
  "bill_done_old",
  "delivered_old",
] as const satisfies readonly DashboardSalesDateType[];

const GROUP_C_KEYS = [
  "still_bill_open",
  "still_not_delivered",
] as const satisfies readonly DashboardSalesDateType[];

const MORE_VIEW_KEYS = [...GROUP_B_KEYS, ...GROUP_C_KEYS] as const;

function shiftDate(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatAppIsoCalendarDate(date);
}

function getMonthStart(dateValue: string) {
  const [year, month] = dateValue.split("-");
  return `${year}-${month}-01`;
}

function formatChipTotal(value: number) {
  return new Intl.NumberFormat(DASHBOARD_LOCALE, {
    maximumFractionDigits: 0,
  }).format(value);
}

function getActiveFilterHelp(dateType: DashboardSalesDateType) {
  switch (dateType) {
    case "all_orders":
      return "All orders created in this date range.";
    case "not_delivered":
      return "Created here, not delivered yet (invoice not finished early).";
    case "bill_done_early":
      return "Invoice finished before delivery.";
    case "bill_open":
      return "Delivered, but invoice still open.";
    case "done_after_delivery":
      return "Delivered and invoice finished.";
    case "bill_done_in_dates":
      return "Created and invoice finished in this range — separate from All orders.";
    case "delivered_in_dates":
      return "Created and delivered in this range — separate from All orders.";
    case "bill_done_old":
      return "Invoice finished in this range, but order was created earlier.";
    case "delivered_old":
      return "Delivered in this range, but order was created earlier.";
    case "still_bill_open":
      return "Any day: delivered, invoice still open. Ignores From–To.";
    case "still_not_delivered":
      return "Any day: not delivered yet. Ignores From–To.";
  }
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

function FilterChip({
  label,
  total,
  selected,
  onSelect,
  compact = false,
}: {
  label: string;
  total: number;
  selected: boolean;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "rounded-md border px-3 text-left transition-colors",
        compact ? "py-1.5" : "min-w-[7.5rem] py-2",
        selected
          ? "border-primary bg-primary/10 ring-1 ring-primary/40"
          : "border-border/80 bg-background hover:border-border hover:bg-muted/40",
      )}
    >
      <span className={cn("block font-medium", compact ? "text-xs" : "text-sm")}>
        {label}
      </span>
      <span
        className={cn(
          "mt-0.5 block tabular-nums",
          compact ? "text-[11px]" : "text-xs",
          selected ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {formatChipTotal(total)}
      </span>
    </button>
  );
}

/** Parallel route `@filters` — date range and analysis controls (client). */
export function DashboardFiltersSlot({ permissionKeys }: { permissionKeys: string[] }) {
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
    filterSummaries,
  } = useDashboardOverview();

  const allowedDateTypes = useMemo(
    () => getAllowedDashboardDateTypes(permissionKeys),
    [permissionKeys],
  );
  const allowedDateTypeSet = useMemo(
    () => new Set<DashboardSalesDateType>(allowedDateTypes),
    [allowedDateTypes],
  );

  const summaryByKey = useMemo(() => {
    const map = new Map<DashboardSalesDateType, number>();
    for (const row of filterSummaries) {
      map.set(row.key, row.total);
    }
    return map;
  }, [filterSummaries]);

  const hasGroupA =
    allowedDateTypeSet.has("all_orders") ||
    GROUP_A_KEYS.slice(1).some((key) => allowedDateTypeSet.has(key));
  const hasGroupB = GROUP_B_KEYS.some((key) => allowedDateTypeSet.has(key));
  const hasGroupC = GROUP_C_KEYS.some((key) => allowedDateTypeSet.has(key));
  const hasMoreViews = hasGroupB || hasGroupC;
  const moreViewSelected = (MORE_VIEW_KEYS as readonly string[]).includes(dateType);

  const [moreViewsOpen, setMoreViewsOpen] = useState(moreViewSelected);

  useEffect(() => {
    if (allowedDateTypes.length > 0 && !allowedDateTypeSet.has(dateType)) {
      setDateType(allowedDateTypes[0]);
    }
  }, [allowedDateTypeSet, allowedDateTypes, dateType, setDateType]);

  useEffect(() => {
    if (moreViewSelected) setMoreViewsOpen(true);
  }, [moreViewSelected]);

  const lastUpdatedLabel = lastUpdatedAt
    ? new Intl.DateTimeFormat(DASHBOARD_LOCALE, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: DASHBOARD_TIME_ZONE,
      }).format(new Date(lastUpdatedAt))
    : "Waiting for first refresh";

  const visibleGroupA = GROUP_A_KEYS.filter((key) => allowedDateTypeSet.has(key));
  const visibleGroupB = GROUP_B_KEYS.filter((key) => allowedDateTypeSet.has(key));
  const visibleGroupC = GROUP_C_KEYS.filter((key) => allowedDateTypeSet.has(key));

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="space-y-1 border-b pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold tracking-wide">Filters</p>
            <p className="text-muted-foreground text-sm">
              Pick a date range, then choose which orders the charts show.
            </p>
            <p className="text-muted-foreground text-xs">
              Auto-refreshes every 60s · Last updated: {lastUpdatedLabel}
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

      <CardContent className="border-primary/55 space-y-5 border-t-4 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                From
              </p>
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="h-9 w-[11rem] rounded-sm border-border bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                To
              </p>
              <Input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="h-9 w-[11rem] rounded-sm border-border bg-background"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-0.5">
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
          </div>

          <div className="space-y-1.5">
            <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
              Break down by
            </p>
            <div className="bg-muted/20 flex h-9 items-center gap-5 rounded-md border border-border px-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={analysisType === "merchant"}
                  onChange={() => setAnalysisType("merchant")}
                />
                <span>Merchant</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={analysisType === "gateway"}
                  onChange={() => setAnalysisType("gateway")}
                />
                <span>Payment gateway</span>
              </label>
            </div>
          </div>
        </div>

        {hasInvalidRange && (
          <p className="text-xs text-red-500">
            From date must be earlier than or equal to To date.
          </p>
        )}

        {hasGroupA && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Orders created in these dates</p>
              <p className="text-muted-foreground text-xs">
                These four parts add up to All orders
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {visibleGroupA.map((key) => (
                <FilterChip
                  key={key}
                  label={getDashboardSalesDateTypeLabel(key)}
                  total={summaryByKey.get(key) ?? 0}
                  selected={dateType === key}
                  onSelect={() => setDateType(key)}
                />
              ))}
            </div>
          </div>
        )}

        {hasMoreViews && (
          <div className="space-y-2 border-t border-border/60 pt-3">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-medium"
              onClick={() => setMoreViewsOpen((open) => !open)}
              aria-expanded={moreViewsOpen}
            >
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  moreViewsOpen ? "rotate-0" : "-rotate-90",
                )}
              />
              More views
              {moreViewSelected ? (
                <span className="text-foreground/80 font-normal">
                  · {getDashboardSalesDateTypeLabel(dateType)}
                </span>
              ) : null}
            </button>

            {moreViewsOpen && (
              <div className="space-y-3">
                {hasGroupB && (
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground text-xs">
                      Finished in these dates (does not add to All orders)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {visibleGroupB.map((key) => (
                        <FilterChip
                          key={key}
                          compact
                          label={getDashboardSalesDateTypeLabel(key)}
                          total={summaryByKey.get(key) ?? 0}
                          selected={dateType === key}
                          onSelect={() => setDateType(key)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {hasGroupC && (
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground text-xs">
                      Still open any day (ignores From–To)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {visibleGroupC.map((key) => (
                        <FilterChip
                          key={key}
                          compact
                          label={getDashboardSalesDateTypeLabel(key)}
                          total={summaryByKey.get(key) ?? 0}
                          selected={dateType === key}
                          onSelect={() => setDateType(key)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {(hasGroupA || hasMoreViews) && (
          <p className="text-muted-foreground border-t border-border/40 pt-3 text-xs">
            Showing: {getActiveFilterHelp(dateType)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
