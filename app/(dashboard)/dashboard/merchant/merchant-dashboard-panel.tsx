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
  const overviewChart =
    data.overview?.map((row) => ({
      name: row.displayName,
      target: row.targetAmount ?? 0,
      sales: row.mtdSales,
    })) ?? [];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,#0f766e22,#134e4a33,#042f2e11)] p-5 sm:p-6">
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
      </section>

      {data.viewerIsAdmin && data.overview && data.overview.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All merchants — targets vs MTD sales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overviewChart} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number) => formatMoney(value)}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="target" name="Target" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sales" name="MTD sales" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-3 font-medium">Merchant</th>
                    <th className="py-2 pr-3 font-medium">Target</th>
                    <th className="py-2 pr-3 font-medium">MTD</th>
                    <th className="py-2 pr-3 font-medium">%</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.overview.map((row) => (
                    <tr
                      key={row.merchantId}
                      className="hover:bg-muted/40 cursor-pointer border-b border-border/60"
                      onClick={() => {
                        if (isBusy) return;
                        setMerchantId(row.merchantId);
                        void reload(row.merchantId);
                      }}
                    >
                      <td className="py-2 pr-3 font-medium">{row.displayName}</td>
                      <td className="py-2 pr-3">
                        {row.targetAmount != null ? formatMoney(row.targetAmount) : "—"}
                      </td>
                      <td className="py-2 pr-3">{formatMoney(row.mtdSales)}</td>
                      <td className="py-2 pr-3">
                        {row.percent != null ? `${row.percent}%` : "—"}
                      </td>
                      <td className="py-2 capitalize">{row.status.replace("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
            {data.target.assignedByName && (
              <p className="text-muted-foreground text-xs">
                Last assigned by {data.target.assignedByName}
                {data.target.assignedAt
                  ? ` · ${new Date(data.target.assignedAt).toLocaleString()}`
                  : ""}
              </p>
            )}
            {data.canManageTargets && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-muted-foreground text-xs font-medium">
                    Set target (LKR)
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step={1000}
                    disabled={isBusy}
                    value={targetInput}
                    onChange={(e) => setTargetInput(e.target.value)}
                    placeholder="e.g. 500000"
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
                    <Tooltip formatter={(value: number) => formatMoney(value)} />
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
