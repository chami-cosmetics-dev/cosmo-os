"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { RiderHandoverPanel } from "@/components/organisms/rider-handover-panel";
import { RiderIncentiveStatementDialog } from "@/components/organisms/rider-incentive-statement-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  excludedFromIncentiveTotal?: number;
};

type DistrictOption = {
  labelKey: string;
  label: string;
  riderDeliveryCharge: string;
};

type UnmatchedOrderDetail = {
  taskId: string;
  orderId: string;
  orderNumber: string;
  deliveryType: string;
  city: string | null;
  cityUsable?: boolean;
  deliveryPrice?: string | null;
  addressText: string;
  phone: string | null;
  source: string | null;
  suggestions: DistrictOption[];
};

type UnmatchedByRider = {
  riderId: string;
  riderName: string;
  orders: UnmatchedOrderDetail[];
};

function todayInputValue() {
  return formatAppIsoDate(new Date(), new Date().toISOString().slice(0, 10));
}

function riderDisplayName(row: RiderPerformanceRow) {
  return row.knownName || row.name || row.riderId;
}

export function RiderPerformancePanel({
  canManagePerformance = false,
  canExportIncentive = false,
  canHandoverSummary = false,
  canHandoverReceive = false,
  riders = [],
}: {
  canManagePerformance?: boolean;
  canExportIncentive?: boolean;
  canHandoverSummary?: boolean;
  canHandoverReceive?: boolean;
  riders?: Array<{ id: string; name: string | null; knownName: string | null }>;
}) {
  const [from, setFrom] = useState(todayInputValue);
  const [to, setTo] = useState(todayInputValue);
  const [rows, setRows] = useState<RiderPerformanceRow[]>([]);
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [unmatchedByRider, setUnmatchedByRider] = useState<UnmatchedByRider[]>([]);
  const [districtOptions, setDistrictOptions] = useState<DistrictOption[]>([]);
  const [selectedByTask, setSelectedByTask] = useState<Record<string, string>>({});
  const [filterByTask, setFilterByTask] = useState<Record<string, string>>({});
  const [amountByTask, setAmountByTask] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statementRider, setStatementRider] = useState<RiderPerformanceRow | null>(null);
  const [statementRefresh, setStatementRefresh] = useState(0);
  const isBusy = busyKey !== null;

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
        setUnmatchedByRider([]);
        setDistrictOptions([]);
        return;
      }
      setRows(Array.isArray(data.riders) ? data.riders : []);
      setSummary(data.summary ?? null);
      setUnmatchedByRider(Array.isArray(data.unmatchedByRider) ? data.unmatchedByRider : []);
      setDistrictOptions(Array.isArray(data.districtOptions) ? data.districtOptions : []);
      setSelectedByTask({});
      setFilterByTask({});
      setAmountByTask({});
      setStatementRefresh((value) => value + 1);
    } catch {
      notify.error("Failed to load performance");
      setRows([]);
      setSummary(null);
      setUnmatchedByRider([]);
      setDistrictOptions([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const unmatchedTotal = summary?.unmatchedTotal ?? 0;

  async function saveManualDistrict(taskId: string) {
    const labelKey = selectedByTask[taskId];
    if (!labelKey) {
      notify.error("Select a district first");
      return;
    }
    setBusyKey(`district:${taskId}`);
    try {
      const res = await fetch("/api/admin/riders/performance/manual-district", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, labelKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      notify.success(
        `Saved ${data.label ?? labelKey} · ${data.incentiveAmount ?? "0.00"} rider pay`
      );
      await load();
    } catch {
      notify.error("Save failed");
    } finally {
      setBusyKey(null);
    }
  }

  async function saveManualAmount(taskId: string) {
    const amount = (amountByTask[taskId] ?? "").trim();
    if (!amount) {
      notify.error("Enter a rider pay amount");
      return;
    }
    setBusyKey(`amount:${taskId}`);
    try {
      const res = await fetch("/api/admin/riders/performance/manual-amount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, amount }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        notify.error(typeof data.error === "string" ? data.error : "Save failed");
        return;
      }
      notify.success(`Saved manual pay ${data.incentiveAmount ?? amount}`);
      await load();
    } catch {
      notify.error("Save failed");
    } finally {
      setBusyKey(null);
    }
  }

  function filteredOptions(taskId: string) {
    const q = (filterByTask[taskId] ?? "").trim().toLowerCase();
    if (!q) return districtOptions;
    return districtOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        opt.labelKey.includes(q) ||
        opt.riderDeliveryCharge.includes(q)
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Rider performance</CardTitle>
            <CardDescription className="mt-1">
              Completed deliveries and rider pay from shipping-rule charges (Asia/Colombo dates).
              Pick up, free-ship, and STAFFDC are not paid. Unmatched rows can take a district
              from the charge sheet, or a typed rider pay when no district fits.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">From</label>
              <Input
                type="date"
                value={from}
                disabled={isBusy}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-muted-foreground mb-1 block text-xs">To</label>
              <Input
                type="date"
                value={to}
                disabled={isBusy}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button type="button" onClick={() => void load()} disabled={loading || isBusy}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </CardHeader>
      </Card>

      {canHandoverSummary || canHandoverReceive ? (
        <RiderHandoverPanel
          from={from}
          to={to}
          riders={riders}
          canHandoverSummary={canHandoverSummary}
          canHandoverReceive={canHandoverReceive}
          disabled={isBusy || loading}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
            <CardDescription>No pay (Pick up / Free ship / STAFFDC)</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {summary?.excludedFromIncentiveTotal ?? 0}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unmatched labels</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {unmatchedTotal}
              {unmatchedTotal > 0 ? (
                <span className="text-destructive ml-2 text-xs font-medium">needs district</span>
              ) : null}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Unmatched under riders</CardTitle>
          <CardDescription>
            {canManagePerformance
              ? "Review the address. Pick a district, or type a rider pay amount when no district fits, then save."
              : "Orders that need a district for rider pay. Assign riders.performance.manage to set districts."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {unmatchedByRider.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {loading ? "Loading…" : "No unmatched orders in this range."}
            </p>
          ) : (
            unmatchedByRider.map((group) => (
              <div key={group.riderId} className="rounded-lg border">
                <div className="bg-secondary/20 flex items-center justify-between gap-2 px-3 py-2">
                  <p className="font-medium">{group.riderName}</p>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {group.orders.length} unmatched
                  </span>
                </div>
                <div className="divide-y">
                  {group.orders.map((order) => {
                    const selected = selectedByTask[order.taskId] ?? "";
                    const options = filteredOptions(order.taskId);
                    const savingDistrict = busyKey === `district:${order.taskId}`;
                    const savingAmount = busyKey === `amount:${order.taskId}`;
                    return (
                      <div key={order.taskId} className="space-y-3 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-muted-foreground text-xs">
                              {order.deliveryType}
                              {order.cityUsable !== false && order.city
                                ? ` · city ${order.city}`
                                : ""}
                              {!order.cityUsable && order.deliveryPrice
                                ? ` · delivery ${order.deliveryPrice}`
                                : ""}
                              {order.source ? ` · ${order.source}` : ""}
                            </p>
                          </div>
                          {order.phone ? (
                            <p className="text-muted-foreground text-xs">{order.phone}</p>
                          ) : null}
                        </div>
                        <p className="text-sm leading-snug">{order.addressText}</p>

                        {canManagePerformance && order.suggestions.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {order.suggestions.map((sug) => (
                              <Button
                                key={sug.labelKey}
                                type="button"
                                size="sm"
                                variant={selected === sug.labelKey ? "default" : "outline"}
                                disabled={isBusy}
                                onClick={() =>
                                  setSelectedByTask((prev) => ({
                                    ...prev,
                                    [order.taskId]: sug.labelKey,
                                  }))
                                }
                              >
                                {sug.label} · {sug.riderDeliveryCharge}
                              </Button>
                            ))}
                          </div>
                        ) : null}

                        {canManagePerformance ? (
                          <>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="min-w-0 flex-1 space-y-1">
                              <label className="text-muted-foreground block text-xs">
                                Search districts
                              </label>
                              <Input
                                value={filterByTask[order.taskId] ?? ""}
                                disabled={isBusy}
                                placeholder="Type city / district…"
                                onChange={(e) =>
                                  setFilterByTask((prev) => ({
                                    ...prev,
                                    [order.taskId]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <div className="min-w-0 flex-[2] space-y-1">
                              <label className="text-muted-foreground block text-xs">
                                District (with rider pay)
                              </label>
                              <select
                                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                                value={selected}
                                disabled={isBusy}
                                onChange={(e) =>
                                  setSelectedByTask((prev) => ({
                                    ...prev,
                                    [order.taskId]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Select district…</option>
                                {options.map((opt) => (
                                  <option key={opt.labelKey} value={opt.labelKey}>
                                    {opt.label} — {opt.riderDeliveryCharge}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Button
                              type="button"
                              disabled={isBusy || !selected}
                              onClick={() => void saveManualDistrict(order.taskId)}
                            >
                              {savingDistrict ? (
                                <>
                                  <Loader2 className="animate-spin" aria-hidden />
                                  Saving...
                                </>
                              ) : (
                                "Save"
                              )}
                            </Button>
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                            <div className="w-full space-y-1 sm:max-w-xs">
                              <label className="text-muted-foreground block text-xs">
                                Manual rider pay
                              </label>
                              <Input
                                inputMode="decimal"
                                value={amountByTask[order.taskId] ?? ""}
                                disabled={isBusy}
                                placeholder="Amount"
                                onChange={(e) =>
                                  setAmountByTask((prev) => ({
                                    ...prev,
                                    [order.taskId]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                            <Button
                              type="button"
                              disabled={isBusy || !(amountByTask[order.taskId] ?? "").trim()}
                              onClick={() => void saveManualAmount(order.taskId)}
                            >
                              {savingAmount ? (
                                <>
                                  <Loader2 className="animate-spin" aria-hidden />
                                  Saving...
                                </>
                              ) : (
                                "Save amount"
                              )}
                            </Button>
                          </div>
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

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
                      <tr
                        key={row.riderId}
                        className={
                          canExportIncentive
                            ? "hover:bg-secondary/40 cursor-pointer border-t"
                            : "border-t"
                        }
                        onClick={canExportIncentive ? () => setStatementRider(row) : undefined}
                      >
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

      {canExportIncentive ? (
        <RiderIncentiveStatementDialog
          open={statementRider !== null}
          onOpenChange={(open) => {
            if (!open) setStatementRider(null);
          }}
          riderId={statementRider?.riderId ?? null}
          riderLabel={statementRider ? riderDisplayName(statementRider) : ""}
          from={from}
          to={to}
          refreshKey={statementRefresh}
        />
      ) : null}
    </div>
  );
}
