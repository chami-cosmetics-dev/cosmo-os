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

type DispatchOrder = {
  orderId: string;
  reference: string;
  customerName: string;
  customerPhone: string | null;
  customerCity: string | null;
  totalPrice: string;
  currency: string;
  paymentType: string | null;
  dispatchedAt: string;
  locationName: string;
  items: Array<{ title: string; qty: number }>;
};

type DispatchGroup = {
  dispatcherId: string;
  dispatcherName: string;
  dispatchType: "rider" | "courier";
  orders: DispatchOrder[];
};

type SummaryData = {
  date: string;
  companyName: string | null;
  totalOrders: number;
  riderOrders: number;
  courierOrders: number;
  groups: DispatchGroup[];
} | null;

export function DispatchSummaryPage() {
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState<SummaryData>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/fulfillment/dispatch-summary?date=${date}`, {
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
  }, [date, refreshTick]);

  async function handleDownload() {
    if (!date) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/fulfillment/dispatch-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
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
      a.download = `dispatch-summary-${date}.zip`;
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
            View orders dispatched per rider and courier service for a given day.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-foreground">Date</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={() => dateInputRef.current?.showPicker?.()}
                onFocus={() => dateInputRef.current?.showPicker?.()}
                className="h-10 min-w-55 pl-9"
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

      {loading && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}

      {!loading && error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!loading && !error && data && (
        <>
          {/* stat cards */}
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={Package} label="Total Dispatched" value={data.totalOrders} />
            <StatCard icon={Users} label="Via Rider" value={data.riderOrders} />
            <StatCard icon={Truck} label="Via Courier" value={data.courierOrders} />
          </div>

          {data.groups.length === 0 ? (
            <p className="rounded-md border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              No dispatches found for {date}.
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
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium">Order</th>
                          <th className="px-4 py-2 font-medium">Merchant</th>
                          <th className="px-4 py-2 font-medium">Customer</th>
                          <th className="px-4 py-2 font-medium">Items</th>
                          <th className="px-4 py-2 font-medium">Amount</th>
                          <th className="px-4 py-2 font-medium">Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.orders.map((order) => (
                          <tr key={order.orderId} className="border-b last:border-0 hover:bg-muted/20">
                            <td className="px-4 py-2 font-medium">{order.reference}</td>
                            <td className="px-4 py-2 text-muted-foreground">{order.locationName}</td>
                            <td className="px-4 py-2">
                              <p>{order.customerName}</p>
                              {order.customerPhone && (
                                <p className="text-xs text-muted-foreground">{order.customerPhone}</p>
                              )}
                              {order.customerCity && (
                                <p className="text-xs text-muted-foreground">{order.customerCity}</p>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {order.items.map((item, i) => (
                                <p key={i} className="text-xs">
                                  {item.qty > 1 && <span className="mr-1 font-medium">{item.qty}×</span>}
                                  {item.title}
                                </p>
                              ))}
                            </td>
                            <td className="px-4 py-2">{formatAmount(order.totalPrice, order.currency)}</td>
                            <td className="px-4 py-2 text-muted-foreground">{formatPaymentType(order.paymentType)}</td>
                          </tr>
                        ))}
                      </tbody>
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
