"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  SalesInsightsMonth,
  SalesTotals,
} from "@/lib/page-data/merchant-dashboard-sales-insights";

const PICKED_A_COLOR = "#0d9488";
const PICKED_B_COLOR = "#6366f1";
const OTHER_MONTH_COLOR = "#64748b";

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

function pickTotals(month: SalesInsightsMonth, delivered: boolean, toDate: boolean) {
  if (delivered) return toDate ? month.deliveredToDate : month.delivered;
  return toDate ? month.invoiceToDate : month.invoice;
}

function Tile(props: {
  label: string;
  totals: SalesTotals;
  tone?: "default" | "danger";
  countFirst?: boolean;
}) {
  const danger = props.tone === "danger";
  const orders = `${props.totals.orderCount} order${props.totals.orderCount === 1 ? "" : "s"}`;
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

function CompareRow(props: { label: string; a: SalesTotals; b: SalesTotals }) {
  const diff = props.a.total - props.b.total;
  const pct = props.b.total > 0 ? (diff / props.b.total) * 100 : null;
  const up = diff >= 0;
  return (
    <div className="grid grid-cols-2 gap-2 border-t border-border/50 py-2 text-sm sm:grid-cols-4">
      <span className="text-muted-foreground col-span-2 sm:col-span-1">{props.label}</span>
      <span className="font-medium" style={{ color: PICKED_A_COLOR }}>
        {formatMoney(props.a.total)}
      </span>
      <span className="font-medium" style={{ color: PICKED_B_COLOR }}>
        {formatMoney(props.b.total)}
      </span>
      <span className={`col-span-2 font-medium sm:col-span-1 ${up ? "text-emerald-400" : "text-red-400"}`}>
        {up ? "+" : "−"}
        {formatMoney(Math.abs(diff))}
        {pct != null ? ` (${up ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)` : ""}
      </span>
    </div>
  );
}

export function MerchantSalesInsightsCard({ merchantId }: { merchantId: string }) {
  const [insights, setInsights] = useState<MerchantSalesInsights | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = loadedFor !== merchantId;
  const [deliveredOnly, setDeliveredOnly] = useState(false);
  const [monthA, setMonthA] = useState("");
  const [monthB, setMonthB] = useState("");

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
        setMonthA(next.months[0]?.yearMonth ?? "");
        setMonthB(next.months[1]?.yearMonth ?? "");
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

  const chartRows = useMemo(
    () =>
      [...(insights?.months ?? [])].reverse().map((month) => ({
        yearMonth: month.yearMonth,
        label: monthLabel(month.yearMonth),
        total: pickTotals(month, deliveredOnly, false).total,
      })),
    [insights, deliveredOnly],
  );

  const a = insights?.months.find((m) => m.yearMonth === monthA) ?? null;
  const b = insights?.months.find((m) => m.yearMonth === monthB) ?? null;
  const basisLabel = deliveredOnly ? "delivered" : "invoiced";
  const currentMonth = insights?.months[0];

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Cancellations &amp; month compare</CardTitle>
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
        {loading && !insights ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Loading...
          </p>
        ) : !insights || !currentMonth ? (
          <p className="text-muted-foreground text-sm">No data.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile
                label={`Sales today (${basisLabel})`}
                totals={deliveredOnly ? insights.today.delivered : insights.today.invoice}
              />
              <Tile
                label={`Sales MTD (${basisLabel})`}
                totals={pickTotals(currentMonth, deliveredOnly, false)}
              />
              <Tile
                label="Cancelled today"
                totals={insights.cancelled.today}
                tone="danger"
                countFirst
              />
              <Tile
                label="Cancelled MTD"
                totals={insights.cancelled.mtd}
                tone="danger"
                countFirst
              />
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Compare</span>
                <Select value={monthA || undefined} onValueChange={setMonthA}>
                  <SelectTrigger className="w-[140px]" style={{ borderColor: PICKED_A_COLOR }}>
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {insights.months.map((m) => (
                      <SelectItem key={m.yearMonth} value={m.yearMonth}>
                        {monthLabel(m.yearMonth)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">with</span>
                <Select value={monthB || undefined} onValueChange={setMonthB}>
                  <SelectTrigger className="w-[140px]" style={{ borderColor: PICKED_B_COLOR }}>
                    <SelectValue placeholder="Month" />
                  </SelectTrigger>
                  <SelectContent>
                    {insights.months.map((m) => (
                      <SelectItem key={m.yearMonth} value={m.yearMonth}>
                        {monthLabel(m.yearMonth)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={formatCompactMoney} tick={{ fontSize: 12 }} width={48} />
                    <Tooltip
                      formatter={(value) => [formatMoney(Number(value)), `Sales (${basisLabel})`]}
                      cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                    />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {chartRows.map((row) => (
                        <Cell
                          key={row.yearMonth}
                          fill={
                            row.yearMonth === monthA
                              ? PICKED_A_COLOR
                              : row.yearMonth === monthB
                                ? PICKED_B_COLOR
                                : OTHER_MONTH_COLOR
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {a && b ? (
                <div>
                  <div className="text-muted-foreground grid grid-cols-2 gap-2 pb-1 text-xs sm:grid-cols-4">
                    <span className="hidden sm:block" />
                    <span>{monthLabel(a.yearMonth)}</span>
                    <span>{monthLabel(b.yearMonth)}</span>
                    <span className="hidden sm:block">Difference</span>
                  </div>
                  <CompareRow
                    label={`Days 1–${insights.dayOfMonth} (same period)`}
                    a={pickTotals(a, deliveredOnly, true)}
                    b={pickTotals(b, deliveredOnly, true)}
                  />
                  <CompareRow
                    label="Whole month"
                    a={pickTotals(a, deliveredOnly, false)}
                    b={pickTotals(b, deliveredOnly, false)}
                  />
                  <p className="text-muted-foreground pt-1 text-xs">
                    {monthLabel(currentMonth.yearMonth)} runs only through today, so
                    use the same-period row for a fair compare against it.
                  </p>
                </div>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
