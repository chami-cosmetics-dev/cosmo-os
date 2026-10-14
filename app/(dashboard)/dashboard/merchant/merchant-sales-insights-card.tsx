"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { notify } from "@/lib/notify";
import type {
  MerchantSalesInsights,
  SalesInsightsDay,
  SalesTotals,
} from "@/lib/page-data/merchant-dashboard-sales-insights";

const PERIOD_A_COLOR = "#0d9488";
const PERIOD_B_COLOR = "#6366f1";

type Basis = "invoice" | "delivered";
type DateRange = { from: string; to: string };

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactMoney(value: number) {
  return new Intl.NumberFormat("en-LK", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function monthLabel(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function lastDayOfMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function previousYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

/** Whole month, capped at today for the current month. */
function monthRange(yearMonth: string, todayYmd: string): DateRange {
  const end = `${yearMonth}-${String(lastDayOfMonth(yearMonth)).padStart(2, "0")}`;
  return { from: `${yearMonth}-01`, to: end < todayYmd ? end : todayYmd };
}

/** Ordered, inclusive range — tolerates from/to typed the wrong way round. */
function ordered(range: DateRange): DateRange {
  return range.from <= range.to ? range : { from: range.to, to: range.from };
}

function rangeDays(days: SalesInsightsDay[], range: DateRange): SalesInsightsDay[] {
  const { from, to } = ordered(range);
  return days.filter((day) => day.ymd >= from && day.ymd <= to);
}

function sumDays(days: SalesInsightsDay[], basis: Basis): SalesTotals {
  return days.reduce(
    (acc, day) => ({
      total: acc.total + day[basis].total,
      orderCount: acc.orderCount + day[basis].orderCount,
    }),
    { total: 0, orderCount: 0 },
  );
}

function shortDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function rangeLabel(range: DateRange) {
  const { from, to } = ordered(range);
  return from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`;
}

function ordersText(count: number) {
  return `${count} order${count === 1 ? "" : "s"}`;
}

function Tile(props: {
  label: string;
  totals: SalesTotals;
  tone?: "default" | "danger";
  countFirst?: boolean;
}) {
  const danger = props.tone === "danger";
  const orders = ordersText(props.totals.orderCount);
  return (
    <div
      className={`rounded-lg border p-3 ${
        danger ? "border-red-500/40 bg-red-500/5" : "border-border/70 bg-muted/20"
      }`}
    >
      <p className="text-muted-foreground text-xs">{props.label}</p>
      <p className={`mt-1 text-lg font-semibold ${danger ? "text-red-400" : ""}`}>
        {props.countFirst ? orders : formatMoney(props.totals.total)}
      </p>
      <p className="text-muted-foreground text-xs">
        {props.countFirst ? formatMoney(props.totals.total) : orders}
      </p>
    </div>
  );
}

function PeriodPicker(props: {
  title: string;
  color: string;
  range: DateRange;
  onChange: (range: DateRange) => void;
  monthOptions: string[];
  minYmd: string;
  maxYmd: string;
  totals: SalesTotals;
  dayCount: number;
}) {
  const { range, onChange } = props;
  const matchedMonth = props.monthOptions.find((ym) => {
    const full = monthRange(ym, props.maxYmd);
    return full.from === range.from && full.to === range.to;
  });
  return (
    <div
      className="space-y-2 rounded-lg border p-3"
      style={{ borderColor: `${props.color}80` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium" style={{ color: props.color }}>
          {props.title}
        </span>
        <Select
          value={matchedMonth ?? ""}
          onValueChange={(ym) => onChange(monthRange(ym, props.maxYmd))}
        >
          <SelectTrigger className="h-8 w-[140px]">
            <SelectValue placeholder="Whole month…" />
          </SelectTrigger>
          <SelectContent>
            {props.monthOptions.map((ym) => (
              <SelectItem key={ym} value={ym}>
                {monthLabel(ym)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">From</span>
          <Input
            type="date"
            value={range.from}
            min={props.minYmd}
            max={props.maxYmd}
            onChange={(e) => e.target.value && onChange({ ...range, from: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="text-muted-foreground">To</span>
          <Input
            type="date"
            value={range.to}
            min={props.minYmd}
            max={props.maxYmd}
            onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })}
          />
        </label>
      </div>
      <div>
        <p className="text-lg font-semibold">{formatMoney(props.totals.total)}</p>
        <p className="text-muted-foreground text-xs">
          {ordersText(props.totals.orderCount)} · {props.dayCount} day
          {props.dayCount === 1 ? "" : "s"} · {rangeLabel(range)}
        </p>
      </div>
    </div>
  );
}

export function MerchantSalesInsightsCard({ merchantId }: { merchantId: string }) {
  const [insights, setInsights] = useState<MerchantSalesInsights | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = loadedFor !== merchantId;
  const [deliveredOnly, setDeliveredOnly] = useState(false);
  const [periodA, setPeriodA] = useState<DateRange | null>(null);
  const [periodB, setPeriodB] = useState<DateRange | null>(null);

  useEffect(() => {
    if (!merchantId) return;
    let cancelled = false;
    const params = new URLSearchParams({ merchantUserId: merchantId });
    fetch(`/api/admin/merchant-dashboard/sales-insights?${params}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          notify.error(json.error ?? "Failed to load cancellations & compare");
          return;
        }
        const next = json as MerchantSalesInsights;
        setInsights(next);
        // Default: this month to date vs the same days last month.
        const thisMonth = next.todayYmd.slice(0, 7);
        const lastMonth = previousYearMonth(thisMonth);
        const sameDay = Math.min(Number(next.todayYmd.slice(8, 10)), lastDayOfMonth(lastMonth));
        setPeriodA({ from: `${thisMonth}-01`, to: next.todayYmd });
        setPeriodB({
          from: `${lastMonth}-01`,
          to: `${lastMonth}-${String(sameDay).padStart(2, "0")}`,
        });
      })
      .catch(() => {
        if (!cancelled) notify.error("Failed to load cancellations & compare");
      })
      .finally(() => {
        if (!cancelled) setLoadedFor(merchantId);
      });
    return () => {
      cancelled = true;
    };
  }, [merchantId]);

  const basis: Basis = deliveredOnly ? "delivered" : "invoice";
  const basisLabel = deliveredOnly ? "delivered" : "invoiced";

  const monthOptions = useMemo(() => {
    if (!insights) return [];
    const set = new Set(insights.days.map((day) => day.ymd.slice(0, 7)));
    return [...set].sort().reverse();
  }, [insights]);

  const daysA = useMemo(
    () => (insights && periodA ? rangeDays(insights.days, periodA) : []),
    [insights, periodA],
  );
  const daysB = useMemo(
    () => (insights && periodB ? rangeDays(insights.days, periodB) : []),
    [insights, periodB],
  );

  // Day-by-day overlay: Day 1 of A next to Day 1 of B, and so on.
  const chartRows = useMemo(() => {
    const length = Math.max(daysA.length, daysB.length);
    return Array.from({ length }, (_, i) => ({
      label: `Day ${i + 1}`,
      a: daysA[i]?.[basis].total ?? null,
      b: daysB[i]?.[basis].total ?? null,
      aYmd: daysA[i]?.ymd ?? null,
      bYmd: daysB[i]?.ymd ?? null,
    }));
  }, [daysA, daysB, basis]);

  if (loading && !insights) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading cancellations &amp; compare...
        </CardContent>
      </Card>
    );
  }
  if (!insights || !periodA || !periodB) return null;

  const todayRow = insights.days[insights.days.length - 1];
  const mtd = sumDays(
    rangeDays(insights.days, { from: `${insights.todayYmd.slice(0, 7)}-01`, to: insights.todayYmd }),
    basis,
  );
  const totalsA = sumDays(daysA, basis);
  const totalsB = sumDays(daysB, basis);
  const diff = totalsA.total - totalsB.total;
  const pct = totalsB.total > 0 ? (diff / totalsB.total) * 100 : null;
  const up = diff >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Cancellations &amp; sales compare</CardTitle>
          <p className="text-muted-foreground text-xs">
            Your sales only. Invoice date by default — tick to count only
            delivery-completed sales, dated by delivery day (shop counter sales
            count as delivered on the sale day). Cancellations are dated by the
            day they were cancelled.
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-teal-600"
            checked={deliveredOnly}
            onChange={(e) => setDeliveredOnly(e.target.checked)}
          />
          Delivery completed only
        </label>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label={`Sales today (${basisLabel})`} totals={todayRow?.[basis] ?? { total: 0, orderCount: 0 }} />
          <Tile label={`Sales MTD (${basisLabel})`} totals={mtd} />
          <Tile label="Cancelled today" totals={insights.cancelled.today} tone="danger" countFirst />
          <Tile label="Cancelled MTD" totals={insights.cancelled.mtd} tone="danger" countFirst />
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">
            Compare sales{" "}
            <span className="text-muted-foreground text-xs font-normal">
              — pick any dates from {shortDay(insights.windowFromYmd)} to today, or a whole month
            </span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <PeriodPicker
              title="Period A"
              color={PERIOD_A_COLOR}
              range={periodA}
              onChange={setPeriodA}
              monthOptions={monthOptions}
              minYmd={insights.windowFromYmd}
              maxYmd={insights.todayYmd}
              totals={totalsA}
              dayCount={daysA.length}
            />
            <PeriodPicker
              title="Period B"
              color={PERIOD_B_COLOR}
              range={periodB}
              onChange={setPeriodB}
              monthOptions={monthOptions}
              minYmd={insights.windowFromYmd}
              maxYmd={insights.todayYmd}
              totals={totalsB}
              dayCount={daysB.length}
            />
          </div>

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
            <span className="text-muted-foreground">A vs B</span>
            <span className={`text-lg font-semibold ${up ? "text-emerald-400" : "text-red-400"}`}>
              {up ? "+" : "−"}
              {formatMoney(Math.abs(diff))}
              {pct != null ? ` (${up ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)` : ""}
            </span>
            {daysA.length !== daysB.length ? (
              <span className="text-xs text-amber-400">
                Periods have different lengths ({daysA.length} vs {daysB.length} days)
              </span>
            ) : null}
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={12} />
                <YAxis tickFormatter={formatCompactMoney} tick={{ fontSize: 12 }} width={48} />
                <Tooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                  formatter={(value, name, item) => {
                    const ymd = name === "Period A" ? item.payload.aYmd : item.payload.bYmd;
                    return [formatMoney(Number(value)), ymd ? `${name} (${shortDay(ymd)})` : name];
                  }}
                />
                <Legend />
                <Bar dataKey="a" name="Period A" fill={PERIOD_A_COLOR} radius={[3, 3, 0, 0]} />
                <Bar dataKey="b" name="Period B" fill={PERIOD_B_COLOR} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
