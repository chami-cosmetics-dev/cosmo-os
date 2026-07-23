"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, Download, History, Loader2, MapPin, Printer, RefreshCw, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";
import { formatAppDateTime, formatAppIsoDate } from "@/lib/format-datetime";
import { formatPickListBarcode } from "@/lib/product-item-barcode";

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

type PickListGroup = {
  id: string;
  createdAt: string;
  downloadedAt: string | null;
  label: string;
  printedByName: string | null;
  orderCount: number;
  totalLocations: number;
  totalUnits: number;
  locationGroups: LocationGroup[];
};

type ActivePickListData = {
  activeGroups: PickListGroup[];
  singlePrints: {
    orderCount: number;
    totalLocations: number;
    totalUnits: number;
    locationGroups: LocationGroup[];
  };
  todayLabel?: string;
};

type HistoryPickListData = {
  historyGroups: PickListGroup[];
};

function todayLK() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function LocationTables({ groups }: { groups: LocationGroup[] }) {
  if (groups.length === 0) {
    return (
      <p className="rounded-md border border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
        No items to pick.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
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
                  <th className="px-4 py-2 text-right font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item, idx) => (
                  <tr key={`${group.locationId}-${item.sku ?? item.productTitle}-${idx}`} className="border-b border-border/40 last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{idx + 1}</td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{item.productTitle}</div>
                      {item.variantTitle && (
                        <div className="text-xs text-muted-foreground">{item.variantTitle}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                      {item.sku ?? "—"}
                    </td>
                    <td className="px-4 py-2 font-mono font-semibold whitespace-nowrap">
                      {formatPickListBarcode(item.barcode)}
                    </td>
                    <td className="px-4 py-2 text-right text-lg font-bold">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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

export function PickListPage() {
  const [view, setView] = useState<"active" | "history">("active");
  const [activeData, setActiveData] = useState<ActivePickListData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryPickListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [pickDate, setPickDate] = useState(() => todayLK());
  const fetchedRef = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoint =
        view === "history"
          ? "/api/admin/fulfillment/pick-list?view=history"
          : `/api/admin/fulfillment/pick-list?view=active&date=${pickDate}`;
      const res = await fetch(endpoint, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError((json as { error?: string }).error ?? "Failed to load");
        return;
      }
      if (view === "history") {
        setHistoryData(json as HistoryPickListData);
      } else {
        setActiveData(json as ActivePickListData);
      }
    } catch {
      setError("Failed to load pick list.");
    } finally {
      setLoading(false);
      fetchedRef.current = true;
    }
  }, [view, pickDate]);

  useEffect(() => {
    void loadData();
  }, [loadData, refreshTick]);

  async function downloadGroup(groupId: string) {
    setDownloadingId(groupId);
    try {
      const res = await fetch(`/api/admin/fulfillment/pick-list/groups/${groupId}/download`, {
        method: "POST",
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
      a.download = `pick-list-bulk-${groupId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setRefreshTick((t) => t + 1);
    } catch {
      notify.error("Download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function downloadSingles() {
    setDownloadingId("singles");
    try {
      const res = await fetch("/api/admin/fulfillment/pick-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "singles" }),
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
      a.download = `pick-list-singles-${formatAppIsoDate(new Date())}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      notify.error("Download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function createTodayBulkBatch() {
    setCreatingBatch(true);
    try {
      const res = await fetch("/api/admin/fulfillment/pick-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "create_today_batch" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        notify.error(json.error ?? "Failed to create bulk batch");
        return;
      }
      notify.success("Today's prints grouped as a bulk pick list batch.");
      setRefreshTick((t) => t + 1);
    } catch {
      notify.error("Failed to create bulk batch");
    } finally {
      setCreatingBatch(false);
    }
  }

  const activeGroups = activeData?.activeGroups ?? [];
  const singles = activeData?.singlePrints;
  const historyGroups = historyData?.historyGroups ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory Pick List</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bulk print batches and single-print orders grouped by location
            {activeData?.todayLabel ? ` (${activeData.todayLabel})` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {view === "active" && (
            <Input
              type="date"
              value={pickDate}
              max={todayLK()}
              onChange={(e) => setPickDate(e.target.value || todayLK())}
              className="h-10 w-auto"
            />
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
        </div>
      </div>

      <div className="flex gap-6 border-b border-border/70">
        {(["active", "history"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setView(tab)}
            className={`-mb-px pb-2.5 text-sm font-medium border-b-2 capitalize transition-colors ${
              view === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "active" ? "Active" : "History"}
            {tab === "active" && !loading && activeData
              ? ` (${activeGroups.length + (singles?.orderCount ? 1 : 0)})`
              : ""}
            {tab === "history" && !loading && historyData ? ` (${historyGroups.length})` : ""}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {!loading && error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && view === "active" && activeData && (
        <div className="space-y-8">
          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Printer className="size-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Bulk print batches</h2>
              </div>
              {singles && singles.orderCount > 0 && pickDate === todayLK() && (
                <Button
                  size="sm"
                  className="ml-auto gap-2"
                  disabled={creatingBatch}
                  onClick={() => void createTodayBulkBatch()}
                >
                  {creatingBatch ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Printer className="size-4" />
                  )}
                  Create bulk batch from today ({singles.orderCount} orders)
                </Button>
              )}
            </div>
            {activeGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active bulk pick lists for today. Use Print All on Order Print, or create a batch
                from today&apos;s printed orders below.
              </p>
            ) : (
              activeGroups.map((group) => (
                <div key={group.id} className="space-y-3 rounded-lg border border-border/70 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{group.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.orderCount} order{group.orderCount !== 1 ? "s" : ""} ·{" "}
                        {group.totalLocations} location{group.totalLocations !== 1 ? "s" : ""} ·{" "}
                        {group.totalUnits} units
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="gap-2"
                      disabled={downloadingId === group.id}
                      onClick={() => downloadGroup(group.id)}
                    >
                      {downloadingId === group.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      Download PDF
                    </Button>
                  </div>
                  <LocationTables groups={group.locationGroups} />
                </div>
              ))
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Users className="size-5 text-muted-foreground" />
                <div>
                  <h2 className="text-lg font-semibold">Single-print orders (today)</h2>
                  <p className="text-xs text-muted-foreground">
                    Individually printed today, not part of a bulk batch — grouped by location.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                disabled={
                  downloadingId === "singles" || !singles || singles.locationGroups.length === 0
                }
                onClick={downloadSingles}
              >
                {downloadingId === "singles" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download PDF
              </Button>
            </div>

            {singles && singles.orderCount > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                <StatCard icon={Printer} label="Orders Printed" value={singles.orderCount} />
                <StatCard icon={MapPin} label="Locations" value={singles.totalLocations} />
                <StatCard icon={Boxes} label="Total Units" value={singles.totalUnits} />
              </div>
            )}

            <LocationTables groups={singles?.locationGroups ?? []} />
          </section>
        </div>
      )}

      {!loading && !error && view === "history" && historyData && (
        <div className="space-y-4">
          {historyGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No downloaded bulk pick lists yet.</p>
          ) : (
            historyGroups.map((group) => (
              <div key={group.id} className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <History className="size-4 text-muted-foreground" />
                  <p className="font-medium">{group.label}</p>
                  {group.downloadedAt && (
                    <span className="text-xs text-muted-foreground">
                      Downloaded {formatAppDateTime(group.downloadedAt)}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {group.orderCount} orders · {group.totalUnits} units
                  </span>
                </div>
                <LocationTables groups={group.locationGroups} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
