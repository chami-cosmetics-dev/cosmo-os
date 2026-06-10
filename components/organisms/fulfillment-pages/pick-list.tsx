"use client";

import { useEffect, useRef, useState } from "react";
import { Boxes, CalendarDays, Download, Loader2, MapPin, Printer, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type PickListItem = {
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  barcode: string | null;
  quantity: number;
};

type LocationGroup = {
  locationId: string;
  locationName: string;
  items: PickListItem[];
  totalUnits: number;
};

type PickListData = {
  date: string;
  orderCount: number;
  totalLocations: number;
  totalUnits: number;
  locationGroups: LocationGroup[];
} | null;

export function PickListPage() {
  const dateRef = useRef<HTMLInputElement | null>(null);
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState<PickListData>(null);
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
        const res = await fetch(`/api/admin/fulfillment/pick-list?date=${date}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as PickListData & { error?: string };
        if (!res.ok) {
          setError(json.error ?? "Failed to load");
          return;
        }
        setData(json);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Failed to load pick list.");
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [date, refreshTick]);

  async function handleDownload() {
    if (!date) return;
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/fulfillment/pick-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        notify.error(json.error ?? "Download failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pick-list-${date}.pdf`;
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
          <h1 className="text-2xl font-semibold tracking-tight">Inventory Pick List</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Printed orders grouped by location — items to collect from inventory.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium text-muted-foreground">Date</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={dateRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={() => dateRef.current?.showPicker?.()}
                onFocus={() => dateRef.current?.showPicker?.()}
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
            disabled={downloading || !data || data.locationGroups.length === 0}
            onClick={handleDownload}
          >
            {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download PDF
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard icon={Printer} label="Orders Printed" value={data.orderCount} />
            <StatCard icon={MapPin} label="Locations" value={data.totalLocations} />
            <StatCard icon={Boxes} label="Total Units" value={data.totalUnits} />
          </div>

          {data.locationGroups.length === 0 ? (
            <p className="rounded-md border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              No printed orders found for {date}.
            </p>
          ) : (
            <div className="space-y-4">
              {data.locationGroups.map((group) => (
                <div key={group.locationId} className="rounded-md border border-border/70 bg-background">
                  <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
                    <MapPin className="size-4 text-blue-500" />
                    <span className="font-semibold">{group.locationName}</span>
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {group.items.length} item type{group.items.length !== 1 ? "s" : ""}
                    </span>
                    <span className="rounded border border-border/70 px-2 py-0.5 text-xs text-muted-foreground">
                      {group.totalUnits} units
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30 text-left text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2 font-medium">#</th>
                          <th className="px-4 py-2 font-medium">Item</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">SKU</th>
                          <th className="px-4 py-2 font-medium whitespace-nowrap">Barcode</th>
                          <th className="px-4 py-2 text-right font-medium whitespace-nowrap">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item, idx) => (
                          <tr
                            key={`${group.locationId}-${item.sku ?? item.productTitle}-${idx}`}
                            className="border-b last:border-0 hover:bg-muted/20"
                          >
                            <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                            <td className="px-4 py-2">
                              <div className="font-medium">{item.productTitle}</div>
                              {item.variantTitle && (
                                <div className="text-xs text-muted-foreground">{item.variantTitle}</div>
                              )}
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">
                              {item.sku ?? "—"}
                            </td>
                            <td className="px-4 py-2 font-mono font-semibold whitespace-nowrap">
                              {item.barcode ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-right text-lg font-bold">{item.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/30">
                          <td colSpan={4} className="px-4 py-2 text-xs font-medium text-muted-foreground">
                            {group.items.length} item type{group.items.length !== 1 ? "s" : ""}
                          </td>
                          <td className="px-4 py-2 text-right font-bold">{group.totalUnits}</td>
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

function StatCard({ icon: Icon, label, value }: { icon: typeof Printer; label: string; value: number }) {
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
