"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Download, Loader2, Package, RefreshCw, Truck, Users } from "lucide-react";

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

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

type DispatchOrder = {
  orderId: string;
  reference: string;
  orderDate: string;
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
  dateFrom: string;
  dateTo: string;
  companyName: string | null;
  totalOrders: number;
  riderOrders: number;
  courierOrders: number;
  groups: DispatchGroup[];
} | null;

export function DispatchSummaryPage() {
  const fromRef = useRef<HTMLInputElement | null>(null);
  const toRef = useRef<HTMLInputElement | null>(null);
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [data, setData] = useState<SummaryData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!dateFrom) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ dateFrom });
        if (dateTo && dateTo >= dateFrom) params.set("dateTo", dateTo);
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
  }, [dateFrom, dateTo, refreshTick]);

  async function handleDownload() {
    if (!dateFrom) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/fulfillment/dispatch-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom, dateTo }),
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
      const suffix = dateFrom === dateTo ? dateFrom : `${dateFrom}-to-${dateTo}`;
      a.download = `dispatch-summary-${suffix}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Download failed.");
    } finally {
      setDownloading(false);
    }
  }

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
            View orders dispatched per rider and courier service.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
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
            onClick={() => void handleDownload()}
          >
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download PDFs
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={Package} label="Total Dispatched" value={data.totalOrders} />
            <StatCard icon={Users} label="Via Rider" value={data.riderOrders} />
            <StatCard icon={Truck} label="Via Courier" value={data.courierOrders} />
          </div>

          {data.groups.length === 0 ? (
            <p className="rounded-md border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              No dispatches found for the selected date range.
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
                    <table className="w-full min-w-225 text-sm">
                      <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Invoice No</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Location</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Date</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Merchant</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Payment</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Phone</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">City</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Address</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.orders.map((order) => (
                          <tr key={order.orderId} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2 font-medium whitespace-nowrap">{order.reference}</td>
                            <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{order.locationName}</td>
                            <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{formatDate(order.orderDate)}</td>
                            <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{order.merchantName ?? "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{formatPaymentType(order.paymentType)}</td>
                            <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{order.customerPhone ?? "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{order.city ?? "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground">{order.address ?? "—"}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">{formatAmount(order.totalPrice, order.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/30 font-medium">
                          <td colSpan={8} className="px-4 py-2 text-xs text-muted-foreground">
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
