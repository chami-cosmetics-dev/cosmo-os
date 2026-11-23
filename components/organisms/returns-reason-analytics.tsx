"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notify } from "@/lib/notify";
import type { ReturnsReasonAnalytics } from "@/lib/page-data/order-returns";
import { cn } from "@/lib/utils";

const REASON_COLORS = [
  "#a78bfa",
  "#60a5fa",
  "#2dd4bf",
  "#fbbf24",
  "#f87171",
  "#94a3b8",
  "#f472b6",
  "#34d399",
];

function buildMonthOptions(currentYm: string) {
  const [year, month] = currentYm.split("-").map(Number);
  const options: Array<{ value: string; label: string }> = [];
  for (let offset = 0; offset < 12; offset += 1) {
    let m = month - offset;
    let y = year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const value = `${y}-${String(m).padStart(2, "0")}`;
    const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
    options.push({ value, label });
  }
  return options;
}

function monthCaption(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  if (!y || !m) return yearMonth;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ReturnsReasonAnalyticsPanel({
  initialAnalytics,
  reasonFilter,
  onReasonFilterChange,
}: {
  initialAnalytics: ReturnsReasonAnalytics;
  reasonFilter: string | null;
  onReasonFilterChange: (code: string | null) => void;
}) {
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [yearMonth, setYearMonth] = useState(initialAnalytics.yearMonth);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const loadedMonthRef = useRef(initialAnalytics.yearMonth);

  const monthOptions = useMemo(() => buildMonthOptions(initialAnalytics.yearMonth), [initialAnalytics.yearMonth]);

  useEffect(() => {
    setAnalytics(initialAnalytics);
    setYearMonth(initialAnalytics.yearMonth);
    loadedMonthRef.current = initialAnalytics.yearMonth;
  }, [initialAnalytics]);

  useEffect(() => {
    if (yearMonth === loadedMonthRef.current) return;

    let cancelled = false;
    const load = async () => {
      setLoadingMonth(true);
      try {
        const res = await fetch(`/api/admin/returns/analytics?month=${encodeURIComponent(yearMonth)}`);
        const data = (await res.json()) as ReturnsReasonAnalytics & { error?: string };
        if (!res.ok) {
          notify.error(data.error ?? "Failed to load return reasons");
          if (!cancelled) setYearMonth(loadedMonthRef.current);
          return;
        }
        if (!cancelled) {
          loadedMonthRef.current = data.yearMonth;
          setAnalytics(data);
          onReasonFilterChange(null);
        }
      } catch {
        notify.error("Failed to load return reasons");
        if (!cancelled) setYearMonth(loadedMonthRef.current);
      } finally {
        if (!cancelled) setLoadingMonth(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [yearMonth, onReasonFilterChange]);

  const barConfig = useMemo(() => {
    const config: ChartConfig = {
      count: { label: "Orders", color: "hsl(var(--chart-1))" },
      label: { color: "hsl(var(--background))" },
    };
    return config;
  }, []);

  const pieData = useMemo(
    () =>
      analytics.byReason.map((row, index) => ({
        key: row.code,
        label: row.label,
        value: row.count,
        fill: REASON_COLORS[index % REASON_COLORS.length],
      })),
    [analytics.byReason]
  );

  const pieConfig = useMemo(() => {
    return pieData.reduce<ChartConfig>((config, row) => {
      config[row.key] = { label: row.label, color: row.fill };
      return config;
    }, {});
  }, [pieData]);

  const barData = useMemo(
    () =>
      analytics.byReason.map((row, index) => ({
        code: row.code,
        name: row.label,
        nameShort: row.label.length > 22 ? `${row.label.slice(0, 20)}…` : row.label,
        count: row.count,
        fill: REASON_COLORS[index % REASON_COLORS.length],
      })),
    [analytics.byReason]
  );

  const barHeight = Math.min(320, Math.max(160, barData.length * 36 + 24));

  const handleReasonClick = (code: string) => {
    onReasonFilterChange(reasonFilter === code ? null : code);
  };

  return (
    <section className="space-y-3 rounded-md border border-border/70 p-3" aria-label="Return reason analytics">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">Return reasons</h2>
          <p className="text-muted-foreground text-xs">
            Counts for {monthCaption(analytics.yearMonth)} · by return remark
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loadingMonth && (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs" role="status">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Loading...
            </span>
          )}
          <Select value={yearMonth} onValueChange={setYearMonth} disabled={loadingMonth}>
            <SelectTrigger className="w-[180px]" aria-label="Select month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {analytics.total === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">No returns in this month.</p>
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            Month total <span className="text-foreground font-medium tabular-nums">{analytics.total}</span> returns
          </p>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Return reasons">
            {analytics.byReason.map((row, index) => {
              const active = reasonFilter === row.code;
              return (
                <button
                  key={row.code}
                  type="button"
                  onClick={() => handleReasonClick(row.code)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border/70 bg-background text-muted-foreground hover:bg-secondary/20"
                  )}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: REASON_COLORS[index % REASON_COLORS.length] }}
                    aria-hidden
                  />
                  <span className="font-medium">{row.label}</span>
                  <span className="tabular-nums font-semibold text-foreground">{row.count}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-md border border-border/70 bg-background/40 p-3">
              <p className="mb-2 text-xs font-medium">Orders by reason</p>
              <div style={{ height: barHeight }} className="w-full min-h-[160px]">
                <ChartContainer id="returns-reason-bar" config={barConfig} className="aspect-auto h-full w-full">
                  <BarChart
                    accessibilityLayer
                    data={barData}
                    layout="vertical"
                    margin={{ right: 28, left: 4, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid horizontal={false} />
                    <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} hide />
                    <XAxis dataKey="count" type="number" hide />
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          indicator="line"
                          formatter={(value, _name, item) => {
                            const row = item?.payload as { name?: string; count?: number };
                            return (
                              <div className="flex w-full flex-col gap-0.5">
                                <span className="font-medium">{row?.name}</span>
                                <span className="tabular-nums font-medium">{Number(value ?? row?.count ?? 0)}</span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <Bar dataKey="count" layout="vertical" radius={4} maxBarSize={28}>
                      {barData.map((row) => (
                        <Cell key={row.code} fill={row.fill} />
                      ))}
                      <LabelList
                        dataKey="nameShort"
                        position="insideLeft"
                        offset={8}
                        className="fill-white"
                        fontSize={11}
                      />
                      <LabelList
                        dataKey="count"
                        position="right"
                        offset={8}
                        className="fill-foreground"
                        fontSize={11}
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
            </div>

            <div className="rounded-md border border-border/70 bg-background/40 p-3">
              <p className="mb-2 text-xs font-medium">Share</p>
              <div className="mx-auto h-[200px] w-full max-w-[220px]">
                <ChartContainer id="returns-reason-pie" config={pieConfig} className="mx-auto aspect-square h-full w-full">
                  <PieChart>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          nameKey="label"
                          formatter={(value, _name, item) => {
                            const row = item?.payload as { label?: string; value?: number };
                            const pct = analytics.total
                              ? Math.round((Number(value ?? row?.value ?? 0) / analytics.total) * 100)
                              : 0;
                            return (
                              <div className="flex w-full flex-col gap-0.5">
                                <span className="font-medium">{row?.label}</span>
                                <span className="tabular-nums">
                                  {Number(value ?? row?.value ?? 0)} · {pct}%
                                </span>
                              </div>
                            );
                          }}
                        />
                      }
                    />
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {pieData.map((row) => (
                        <Cell key={row.key} fill={row.fill} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
              <ul className="mt-2 grid gap-1">
                {pieData.map((row) => {
                  const pct = analytics.total ? Math.round((row.value / analytics.total) * 100) : 0;
                  return (
                    <li key={row.key} className="text-muted-foreground flex items-center gap-2 text-xs">
                      <span className="size-2 shrink-0 rounded-full" style={{ background: row.fill }} aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      <span className="text-foreground tabular-nums">{pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
