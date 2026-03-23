"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { useDashboardOverview } from "@/components/organisms/dashboard-overview-context";

function shiftDate(dateValue: string, days: number) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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
  } = useDashboardOverview();

  return (
    <Card className="border-border/70 bg-card shadow-xs">
      <CardHeader className="space-y-1 border-b pb-4">
        <p className="text-sm font-semibold tracking-wide">Filters</p>
        <p className="text-muted-foreground text-sm">
          Adjust date range, date source, and analysis mode for dashboard results.
        </p>
      </CardHeader>
      <CardContent className="border-primary/55 grid gap-4 border-t-4 p-4 md:grid-cols-2 xl:grid-cols-4">
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
              <span>Invoice date</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={dateType === "completed"}
                onChange={() => setDateType("completed")}
              />
              <span>Invoice completed at</span>
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
