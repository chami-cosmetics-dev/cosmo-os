"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, CheckCircle2, Clock, Download, Loader2, Package, RefreshCw, Truck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatPaymentType(raw: string | null) {
  if (!raw) return "—";
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAmount(price: string, currency: string) {
  const n = parseFloat(price);
  return Number.isNaN(n) ? price : `${n.toLocaleString("en-LK", { minimumFractionDigits: 2 })} ${currency}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("en-LK", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function outcomeLabel(outcome: string | null) {
  if (outcome === "delivered") return { label: "Delivered", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" };
  if (outcome === "failed") return { label: "Failed", cls: "border-rose-500/30 bg-rose-500/10 text-rose-700" };
  return { label: "Pending", cls: "border-amber-500/30 bg-amber-500/10 text-amber-700" };
}

type DispatchOrder = {
  orderId: string;
  reference: string;
  orderDate: string;
  dispatchedAt: string;
  deliveryCompleteAt: string | null;
  deliveryOutcome: string | null;
  customerName: string;
  customerPhone: string | null;
  city: string | null;
  address: string | null;
  merchantName: string | null;
  totalPrice: string;
  currency: string;
  paymentType: string | null;
  locationName: string;
};

type DispatchGroup = {
  dispatcherId: string;
  dispatcherName: string;
  dispatchType: "rider" | "courier";
  orders: DispatchOrder[];
};

type SummaryData = {
  status: "pending" | "completed";
  dateFrom: string | null;
  dateTo: string | null;
  companyName: string | null;
  totalOrders: number;
  riderOrders: number;
  courierOrders: number;
  groups: DispatchGroup[];
} | null;

export function DispatchSummaryPage() {
  const fromRef = useRef<HTMLInputElement | null>(null);
  const toRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<"pending" | "completed">("pending");
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [data, setData] = useState<SummaryData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ status });
        if (status === "completed" && dateFrom) {
          params.set("dateFrom", dateFrom);
          if (dateTo && dateTo >= dateFrom) params.set("dateTo", dateTo);
        }
        const res = await fetch(`/api/admin/fulfillment/dispatch-summary?${params}`, {
          signal: controller.signal,
        });
        const json = await res.json() as SummaryData & { error?: string };
        if (!res.ok) { setError(json.error ?? "Failed to load"); return; }
        setData(json);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Failed to load dispatch summary.");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [status, dateFrom, dateTo, refreshTick]);

  function buildDownloadBody() {
    const body: Record<string, string> = { status };
    if (status === "completed" && dateFrom) {
      body.dateFrom = dateFrom;
      if (dateTo) body.dateTo = dateTo;
    }
    return body;
  }

  function fileSuffix() {
    return status === "pending"
      ? `pending-${todayIso()}`
      : dateFrom === dateTo
        ? dateFrom
        : `${dateFrom}-to-${dateTo}`;
  }

  async function triggerDownload(format: "pdf" | "csv") {
    const setter = format === "csv" ? setDownloadingCsv : setDownloading;
    setter(true);
    try {
      const res = await fetch("/api/admin/fulfillment/dispatch-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildDownloadBody(), format }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({})) as { error?: string };
        notify.error(json.error ?? "Download failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dispatch-summary-${fileSuffix()}.${format === "csv" ? "csv" : "zip"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Download failed.");
    } finally {
      setter(false);
    }
  }

  function handleDownload() { void triggerDownload("pdf"); }
  function handleDownloadCsv() { void triggerDownload("csv"); }

  const isCompleted = status === "completed";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {data?.companyName && (
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {data.companyName}
            </p>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">Dispatch Summary</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isCompleted
              ? "Completed deliveries grouped by rider and courier."
              : "All outstanding dispatches awaiting delivery."}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">View</p>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "pending" | "completed")}
              className="h-10 rounded-md border border-border/70 bg-background/90 px-3 text-sm"
            >
              <option value="pending">Pending (Not Delivered)</option>
              <option value="completed">Completed (Delivered)</option>
            </select>
          </div>

          {isCompleted && (
            <>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-muted-foreground">From</span>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={fromRef}
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value);
                      if (dateTo < e.target.value) setDateTo(e.target.value);
                    }}
                    onClick={() => fromRef.current?.showPicker?.()}
                    onFocus={() => fromRef.current?.showPicker?.()}
                    className="h-10 min-w-44 pl-9"
                  />
                </div>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium text-muted-foreground">To</span>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={toRef}
                    type="date"
                    value={dateTo}
                    min={dateFrom}
                    onChange={(e) => setDateTo(e.target.value)}
                    onClick={() => toRef.current?.showPicker?.()}
                    onFocus={() => toRef.current?.showPicker?.()}
                    className="h-10 min-w-44 pl-9"
                  />
                </div>
              </label>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-2"
            disabled={loading}
            onClick={() => setRefreshTick((t) => t + 1)}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="h-10 gap-2"
            disabled={downloading || !data || data.totalOrders === 0}
            onClick={handleDownload}
          >
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download PDFs
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-10 gap-2"
            disabled={downloadingCsv || !data || data.totalOrders === 0}
            onClick={handleDownloadCsv}
          >
            {downloadingCsv ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download CSV
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              icon={isCompleted ? CheckCircle2 : Package}
              label={isCompleted ? "Total Completed" : "Total Pending"}
              value={data.totalOrders}
            />
            <StatCard
              icon={Users}
              label={isCompleted ? "Rider Completed" : "Rider Pending"}
              value={data.riderOrders}
            />
            <StatCard
              icon={Truck}
              label={isCompleted ? "Courier Completed" : "Courier Pending"}
              value={data.courierOrders}
            />
          </div>

          {data.groups.length === 0 ? (
            <p className="rounded-md border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              {isCompleted
                ? "No completed deliveries found for the selected date range."
                : "No pending dispatches. All orders have been delivered."}
            </p>
          ) : (
            <div className="space-y-4">
              {data.groups.map((group) => (
                <div key={group.dispatcherId} className="rounded-md border border-border/70 bg-background">
                  <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
                    {group.dispatchType === "rider" ? (
                      <Users className="size-4 text-blue-500" />
                    ) : (
                      <Truck className="size-4 text-amber-500" />
                    )}
                    <span className="font-semibold">{group.dispatcherName}</span>
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {group.orders.length} order{group.orders.length !== 1 ? "s" : ""}
                    </span>
                    <span className="rounded border border-border/70 px-2 py-0.5 text-xs capitalize text-muted-foreground">
                      {group.dispatchType}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Invoice No</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Location</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">
                            {isCompleted ? "Dispatched" : "Dispatched"}
                          </th>
                          {isCompleted && (
                            <>
                              <th className="px-4 py-2 font-medium whitespace-nowrap">Delivered</th>
                              <th className="px-4 py-2 font-medium whitespace-nowrap">Status</th>
                            </>
                          )}
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Merchant</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Payment</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Phone</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">City</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Address</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.orders.map((order) => {
                          const outcome = outcomeLabel(order.deliveryOutcome);
                          return (
                            <tr key={order.orderId} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-2 font-medium whitespace-nowrap">{order.reference}</td>
                              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{order.locationName}</td>
                              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                                <span className="flex items-center gap-1">
                                  <Clock className="size-3 shrink-0" />
                                  {formatDate(order.dispatchedAt)}
                                </span>
                              </td>
                              {isCompleted && (
                                <>
                                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                                    {order.deliveryCompleteAt ? formatDate(order.deliveryCompleteAt) : "—"}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap">
                                    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${outcome.cls}`}>
                                      {outcome.label}
                                    </span>
                                  </td>
                                </>
                              )}
                              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{order.merchantName ?? "—"}</td>
                              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{formatPaymentType(order.paymentType)}</td>
                              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{order.customerPhone ?? "—"}</td>
                              <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{order.city ?? "—"}</td>
                              <td className="px-4 py-2 text-muted-foreground">{order.address ?? "—"}</td>
                              <td className="px-4 py-2 text-right whitespace-nowrap">{formatAmount(order.totalPrice, order.currency)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/30 font-medium">
                          <td colSpan={isCompleted ? 10 : 8} className="px-4 py-2 text-xs text-muted-foreground">
                            {group.orders.length} order{group.orders.length !== 1 ? "s" : ""}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            {formatAmount(
                              group.orders.reduce((s, o) => s + parseFloat(o.totalPrice || "0"), 0).toFixed(2),
                              group.orders[0]?.currency ?? "LKR",
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border/70 bg-background px-4 py-3">
      <Icon className="size-5 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </div>
    </div>
  );
}
