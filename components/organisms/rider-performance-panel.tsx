"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { formatAppIsoDate } from "@/lib/format-datetime";
import { notify } from "@/lib/notify";

type RiderPerformanceRow = {
  riderId: string;
  name: string | null;
  knownName: string | null;
  completedCount: number;
  incentiveTotal: string;
  unmatchedCount?: number;
};

type PerformanceSummary = {
  totalCompletions: number;
  totalIncentive: string;
  ridersWithCompletions: number;
  unmatchedTotal: number;
};

type DailyPoint = {
  date: string;
  completedCount: number;
  incentiveTotal: string;
};

function todayInputValue() {
  return formatAppIsoDate(new Date(), new Date().toISOString().slice(0, 10));
}

function riderDisplayName(row: RiderPerformanceRow) {
  return row.knownName || row.name || row.riderId;
}

const riderChartConfig = {
  completedCount: { label: "Completions", color: "hsl(var(--chart-1))" },
  incentive: { label: "Incentive", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

const dailyChartConfig = {
  completedCount: { label: "Completions", color: "hsl(var(--chart-1))" },
  incentive: { label: "Incentive", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

export function RiderPerformancePanel() {
  const [from, setFrom] = useState(todayInputValue);
  const [to, setTo] = useState(todayInputValue);
  const [rows, setRows] = useState<RiderPerformanceRow[]>([]);
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [dailySeries, setDailySeries] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/riders/performance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Failed to load performance");
        setRows([]);
        setSummary(null);
        setDailySeries([]);
        return;
      }
      setRows(Array.isArray(data.riders) ? data.riders : []);
      setSummary(data.summary ?? null);
      setDailySeries(Array.isArray(data.dailySeries) ? data.dailySeries : []);
    } catch {
      notify.error("Failed to load performance");
      setRows([]);
      setSummary(null);
      setDailySeries([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const riderBarData = useMemo(
    () =>
      rows.map((row) => ({
        name: riderDisplayName(row),
        completedCount: row.completedCount,
        incentive: Number.parseFloat(row.incentiveTotal) || 0,
        unmatchedCount: row.unmatchedCount ?? 0,
      })),
    [rows]
  );

  const dailyChartData = useMemo(
    () =>
      dailySeries.map((point) => ({
        date: point.date,
        completedCount: point.completedCount,
        incentive: Number.parseFloat(point.incentiveTotal) || 0,
      })),
    [dailySeries]
  );

  const unmatchedTotal = summary?.unmatchedTotal ?? 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Rider performance</CardTitle>
            <CardDescription className="mt-1">
              Completed deliveries and rider pay from shipping-rule delivery charges (Asia/Colombo
              dates).
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Button type="button" onClick={() => void load()} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completions</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary?.totalCompletions ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total incentive</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary?.totalIncentive ?? "0.00"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active riders</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary?.ridersWithCompletions ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unmatched labels</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {unmatchedTotal}
              {unmatchedTotal > 0 ? (
                <span className="text-destructive ml-2 text-xs font-medium">needs rules</span>
              ) : null}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completions by rider</CardTitle>
          </CardHeader>
          <CardContent>
            {riderBarData.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {loading ? "Loading…" : "No data in this range."}
              </p>
            ) : (
              <ChartContainer config={riderChartConfig} className="aspect-auto h-64 w-full">
                <BarChart data={riderBarData} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-20} height={60} fontSize={11} />
                  <YAxis allowDecimals={false} width={36} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="completedCount" fill="var(--color-completedCount)" radius={4} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily trend</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyChartData.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                {loading ? "Loading…" : "No daily points in this range."}
              </p>
            ) : (
              <ChartContainer config={dailyChartConfig} className="aspect-auto h-64 w-full">
                <LineChart data={dailyChartData} margin={{ left: 8, right: 8, top: 8 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis yAxisId="left" allowDecimals={false} width={36} fontSize={11} />
                  <YAxis yAxisId="right" orientation="right" width={48} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="completedCount"
                    stroke="var(--color-completedCount)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="incentive"
                    stroke="var(--color-incentive)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rider detail</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/20 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Rider</th>
                  <th className="px-3 py-2 font-medium">Completed</th>
                  <th className="px-3 py-2 font-medium">Incentive</th>
                  <th className="px-3 py-2 font-medium">Unmatched</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-muted-foreground px-3 py-6 text-center">
                      {loading ? "Loading…" : "No completed deliveries in this range."}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const unmatched = row.unmatchedCount ?? 0;
                    return (
                      <tr key={row.riderId} className="border-t">
                        <td className="px-3 py-2">
                          {riderDisplayName(row)}
                          {unmatched > 0 ? (
                            <span className="bg-destructive/10 text-destructive ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                              unmatched
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.completedCount}</td>
                        <td className="px-3 py-2 tabular-nums">{row.incentiveTotal}</td>
                        <td className="px-3 py-2 tabular-nums">{unmatched}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
