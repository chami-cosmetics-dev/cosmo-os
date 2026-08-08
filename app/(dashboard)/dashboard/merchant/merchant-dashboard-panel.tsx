"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Target } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
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
import type { MerchantDashboardPageData } from "@/lib/page-data/merchant-dashboard";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 0,
  }).format(value);
}

function MerchantChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; color?: string; name?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      {label ? (
        <p className="mb-1.5 font-semibold text-foreground">{label}</p>
      ) : null}
      {payload.map((entry) => (
        <div key={String(entry.dataKey)} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: entry.color ?? "#14b8a6" }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium tabular-nums text-foreground">
            {formatMoney(Number(entry.value ?? 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

const PIE_COLORS = ["#0d9488", "#f59e0b", "#6366f1", "#ef4444", "#14b8a6", "#a855f7"];

type Props = {
  initialData: MerchantDashboardPageData;
};

export function MerchantDashboardPanel({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [merchantId, setMerchantId] = useState(initialData.selectedMerchantId);
  const [targetInput, setTargetInput] = useState(
    initialData.target.targetAmount > 0
      ? String(Math.round(initialData.target.targetAmount))
      : "",
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isBusy = busyKey !== null || isPending;

  useEffect(() => {
    setData(initialData);
    setMerchantId(initialData.selectedMerchantId);
    setTargetInput(
      initialData.target.targetAmount > 0
        ? String(Math.round(initialData.target.targetAmount))
        : "",
    );
  }, [initialData]);

  async function reload(nextMerchantId: string) {
    setBusyKey("reload");
    try {
      const params = new URLSearchParams({
        merchantUserId: nextMerchantId,
        yearMonth: data.yearMonth,
      });
      const res = await fetch(`/api/admin/merchant-dashboard/page-data?${params}`);
      const json = await res.json();
      if (!res.ok) {
        notify.error(json.error ?? "Failed to load merchant dashboard");
        return;
      }
      startTransition(() => {
        setData(json as MerchantDashboardPageData);
        setMerchantId(json.selectedMerchantId);
        setTargetInput(
          json.target.targetAmount > 0
            ? String(Math.round(json.target.targetAmount))
            : "",
        );
      });
    } catch {
      notify.error("Failed to load merchant dashboard");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveTarget() {
    const amount = Number(targetInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify.error("Enter a positive target amount");
      return;
    }
    setBusyKey("save-target");
    try {
      const res = await fetch("/api/admin/merchant-dashboard/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantUserId: merchantId,
          yearMonth: data.yearMonth,
          targetAmount: amount,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        notify.error(json.error ?? "Failed to save target");
        return;
      }
      notify.success(json.action === "set" ? "Target assigned." : "Target updated.");
      await reload(merchantId);
    } catch {
      notify.error("Failed to save target");
    } finally {
      setBusyKey(null);
    }
  }

  const percent = data.target.percent ?? 0;
  const progressWidth = Math.min(100, Math.max(0, percent));
  const locationPie = data.sales.byLocation.map((row, i) => ({
    name: row.locationName,
    value: row.total,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));
  const overviewRows = [...(data.overview ?? [])].sort(
    (a, b) => b.mtdSales - a.mtdSales,
  );
  const maxMtd = Math.max(1, ...overviewRows.map((row) => row.mtdSales));
  const hasAnyTarget = overviewRows.some(
    (row) => row.targetAmount != null && row.targetAmount > 0,
  );
  const overviewChart = overviewRows.map((row) => ({
    name: row.displayName,
    sales: row.mtdSales,
    ...(hasAnyTarget ? { target: row.targetAmount ?? 0 } : {}),
  }));

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,#0f766e22,#134e4a33,#042f2e11)] p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
                Merchant dashboard
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {data.profile.displayName}
              </h1>
            <p className="text-sm text-foreground/80">
              {data.yearMonth} · {data.sales.orderCount} orders ·{" "}
              {formatMoney(data.sales.total)} MTD
              {data.returns.returnRatePct != null
                ? ` · ${data.returns.returnRatePct}% returns`
                : ""}
            </p>
              {data.profile.email && (
                <p className="text-muted-foreground text-xs">{data.profile.email}</p>
              )}
            </div>
            {data.viewerIsAdmin && (
              <div className="w-full max-w-xs space-y-1">
                <label className="text-muted-foreground text-xs font-medium">
                  View merchant
                </label>
                <Select
                  value={merchantId}
                  disabled={isBusy || data.merchants.length === 0}
                  onValueChange={(value) => {
                    setMerchantId(value);
                    void reload(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.merchants.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.displayName}
                        {m.roleNames[0] ? ` (${m.roleNames[0]})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {data.canManageTargets && (
            <div className="rounded-xl border border-white/15 bg-black/10 p-3 backdrop-blur-sm dark:bg-white/5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-muted-foreground text-xs font-medium">
                    Assign monthly target (LKR) — {data.profile.displayName} · {data.yearMonth}
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step={1000}
                    disabled={isBusy}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    placeholder="e.g. 500000"
                    className="bg-background/80"
                  />
                </div>
                <Button disabled={isBusy} onClick={() => void saveTarget()}>
                  {busyKey === "save-target" ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Target aria-hidden />
                      Save target
                    </>
                  )}
                </Button>
              </div>
              {data.target.assignedByName && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Last assigned by {data.target.assignedByName}
                  {data.target.assignedAt
                    ? ` · ${new Date(data.target.assignedAt).toLocaleString()}`
                    : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {data.viewerIsAdmin && overviewRows.length > 0 && (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">All merchants — MTD performance</CardTitle>
            <p className="text-muted-foreground text-xs">
              {hasAnyTarget
                ? "Bars show progress toward each merchant’s monthly target. Click a row to open that merchant."
                : "No targets set yet — bars compare MTD sales to the top merchant this month. Use Assign monthly target at the top after selecting a merchant."}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div
              className="w-full"
              style={{ height: Math.max(220, overviewRows.length * 28) }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={overviewChart}
                  margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    content={<MerchantChartTooltip />}
                    cursor={{ fill: "rgba(148, 163, 184, 0.15)" }}
                  />
                  {hasAnyTarget && (
                    <Bar dataKey="target" name="Target" fill="#64748b" radius={[0, 4, 4, 0]} />
                  )}
                  <Bar dataKey="sales" name="MTD sales" fill="#14b8a6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <ul className="space-y-3">
              {overviewRows.map((row, index) => {
                const hasTarget = row.targetAmount != null && row.targetAmount > 0;
                const towardTarget = hasTarget
                  ? Math.min(100, Math.round((row.mtdSales / (row.targetAmount as number)) * 1000) / 10)
                  : null;
                const relativeShare = Math.round((row.mtdSales / maxMtd) * 1000) / 10;
                const barPct = hasTarget ? Math.min(100, towardTarget ?? 0) : relativeShare;
                const barColor =
                  hasTarget && (towardTarget ?? 0) >= 100
                    ? "bg-emerald-500"
                    : hasTarget && (towardTarget ?? 0) >= 80
                      ? "bg-teal-500"
                      : hasTarget && (towardTarget ?? 0) >= 50
                        ? "bg-amber-500"
                        : hasTarget
                          ? "bg-sky-500"
                          : "bg-teal-500";

                return (
                  <li key={row.merchantId}>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setMerchantId(row.merchantId);
                        void reload(row.merchantId);
                      }}
                      className="hover:bg-muted/40 w-full rounded-xl border border-border/60 px-3 py-3 text-left transition-colors disabled:opacity-60"
                    >
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="bg-muted text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                            {index + 1}
                          </span>
                          <span className="truncate font-medium">{row.displayName}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
                          <span className="font-semibold tabular-nums">
                            {formatMoney(row.mtdSales)}
                          </span>
                          {hasTarget ? (
                            <span className="text-muted-foreground tabular-nums">
                              / {formatMoney(row.targetAmount as number)} ·{" "}
                              <span className="text-foreground font-medium">
                                {towardTarget}%
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">No target</span>
                          )}
                        </div>
                      </div>
                      <div className="bg-muted h-2.5 overflow-hidden rounded-full">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      {!hasTarget && row.mtdSales > 0 && (
                        <p className="text-muted-foreground mt-1.5 text-[11px]">
                          {relativeShare}% of top MTD this month
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              MTD sales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {formatMoney(data.sales.total)}
            </p>
            <p className="text-muted-foreground text-xs">
              {data.sales.orderCount} orders
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Target progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {data.target.percent != null ? `${data.target.percent}%` : "—"}
            </p>
            <div className="bg-muted mt-2 h-2 overflow-hidden rounded-full">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{ width: `${progressWidth}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Return rate (MTD)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-xl font-semibold tabular-nums ${
                (data.returns.returnRatePct ?? 0) >= 10
                  ? "text-amber-600 dark:text-amber-400"
                  : ""
              }`}
            >
              {data.returns.returnRatePct != null
                ? `${data.returns.returnRatePct}%`
                : "—"}
            </p>
            <p className="text-muted-foreground text-xs">
              {data.returns.returnOrderCount} returned / {data.returns.orderCount}{" "}
              orders
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Today’s top buyer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums">
              {data.topCustomersToday[0]
                ? formatMoney(data.topCustomersToday[0].total)
                : "—"}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              {data.topCustomersToday[0]?.name ?? "No buyers today"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Monthly target</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-foreground/90">{data.target.cheerMessage}</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {formatMoney(data.target.achievedAmount)}
                  {data.target.targetAmount > 0
                    ? ` / ${formatMoney(data.target.targetAmount)}`
                    : ""}
                </span>
                <span className="font-medium">
                  {data.target.percent != null ? `${data.target.percent}%` : "No target"}
                </span>
              </div>
              <div className="bg-muted h-3 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full bg-teal-600 transition-all"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
            </div>
            {data.target.assignedByName && !data.canManageTargets && (
              <p className="text-muted-foreground text-xs">
                Last assigned by {data.target.assignedByName}
                {data.target.assignedAt
                  ? ` · ${new Date(data.target.assignedAt).toLocaleString()}`
                  : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sales by location</CardTitle>
          </CardHeader>
          <CardContent>
            {locationPie.length === 0 ? (
              <p className="text-muted-foreground text-sm">No sales in this month yet.</p>
            ) : (
              <div className="mx-auto h-52 w-full max-w-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={locationPie}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={45}
                      outerRadius={75}
                      paddingAngle={2}
                    >
                      {locationPie.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={<MerchantChartTooltip />}
                      cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <ul className="mt-2 space-y-1 text-sm">
              {data.sales.byLocation.map((row) => (
                <li key={row.locationId} className="flex justify-between gap-2">
                  <span className="truncate">{row.locationName}</span>
                  <span className="shrink-0 font-medium">{formatMoney(row.total)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Daily top customers</CardTitle>
            <p className="text-muted-foreground text-xs">
              Today ({data.topCustomersTodayYmd}) — ranked by today’s purchase
              amount. Grouped by phone or email.
            </p>
          </CardHeader>
          <CardContent>
            {data.topCustomersToday.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No purchases attributed to this merchant today.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.topCustomersToday.map((customer, index) => {
                  const maxTotal = Math.max(1, data.topCustomersToday[0]?.total || 1);
                  const share = Math.min(100, (customer.total / maxTotal) * 100);
                  return (
                    <li
                      key={`today-${customer.key}`}
                      className="rounded-xl border border-border/60 px-3 py-2.5"
                    >
                      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="bg-muted text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{customer.name}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {customer.phone || customer.email || "—"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-semibold tabular-nums">
                            {formatMoney(customer.total)}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {customer.orderCount} orders today
                          </p>
                        </div>
                      </div>
                      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full bg-sky-500"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Lifetime top customers</CardTitle>
            <p className="text-muted-foreground text-xs">
              All-time — ranked by how often they buy (distinct purchase days).
              Grouped by phone or email.
            </p>
          </CardHeader>
          <CardContent>
            {data.topCustomersLifetime.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No attributed customer purchases found for this merchant yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.topCustomersLifetime.map((customer, index) => {
                  const maxDays = Math.max(
                    1,
                    data.topCustomersLifetime[0]?.purchaseDays || 1,
                  );
                  const share = Math.min(
                    100,
                    (customer.purchaseDays / maxDays) * 100,
                  );
                  return (
                    <li
                      key={`life-${customer.key}`}
                      className="rounded-xl border border-border/60 px-3 py-2.5"
                    >
                      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="bg-muted text-muted-foreground inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{customer.name}</p>
                            <p className="text-muted-foreground truncate text-xs">
                              {customer.phone || customer.email || "—"}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-semibold tabular-nums">
                            {customer.purchaseDays} purchase days
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {customer.orderCount} orders · {formatMoney(customer.total)}
                          </p>
                        </div>
                      </div>
                      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                        <div
                          className="h-full rounded-full bg-teal-500"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Target history</CardTitle>
        </CardHeader>
        <CardContent>
          {data.history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No targets assigned yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-3 font-medium">Month</th>
                    <th className="py-2 pr-3 font-medium">Target</th>
                    <th className="py-2 pr-3 font-medium">Achieved</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Assigned by</th>
                    <th className="py-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="py-2 pr-3">{row.yearMonth}</td>
                      <td className="py-2 pr-3">{formatMoney(row.targetAmount)}</td>
                      <td className="py-2 pr-3">
                        {row.achievedAmount != null
                          ? formatMoney(row.achievedAmount)
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 capitalize">
                        {row.status.replaceAll("_", " ")}
                      </td>
                      <td className="py-2 pr-3">{row.assignedByName ?? "—"}</td>
                      <td className="py-2">
                        {row.assignedAt
                          ? new Date(row.assignedAt).toLocaleString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
