"use client";

import { useEffect, useState, useCallback } from "react";
import { CheckSquare, Loader2, Search, Square, Truck, X } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { notify } from "@/lib/notify";

type Lookups = {
  courierServices: Array<{ id: string; name: string }>;
  riders: Array<{ id: string; name: string | null; mobile: string | null }>;
};

type ReadyOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  erpnextInvoiceId: string | null;
  totalPrice: string;
  currency: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  companyLocation: { id: string; name: string } | null;
};

type DispatchResult = { orderId: string; ref: string; success: boolean; error?: string };

interface FulfillmentBulkDispatchProps {
  onRefresh: () => void;
}

export function FulfillmentBulkDispatch({ onRefresh }: FulfillmentBulkDispatchProps) {
  const perms = useFulfillmentPermissions();
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [dispatchService, setDispatchService] = useState("");
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<ReadyOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dispatching, setDispatching] = useState(false);
  const [results, setResults] = useState<DispatchResult[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    fetch("/api/admin/orders/fulfillment-lookups")
      .then((r) => r.json())
      .then((data: Lookups) => setLookups(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const t = window.setTimeout(async () => {
      setOrdersLoading(true);
      try {
        const params = new URLSearchParams({ fulfillmentStages: "ready_to_dispatch", pageSize: "100" });
        if (search.trim()) params.set("search", search.trim());
        const res = await fetch(`/api/admin/orders/page-data?${params}`, { signal: controller.signal });
        const data = (await res.json()) as { orders?: ReadyOrder[] };
        setOrders(data.orders ?? []);
      } catch {
        // ignore abort
      } finally {
        setOrdersLoading(false);
      }
    }, 300);
    return () => { controller.abort(); clearTimeout(t); };
  }, [search, refreshTick]);

  const selectedDispatch = dispatchService
    ? {
        type: dispatchService.startsWith("rider:") ? ("rider" as const) : ("courier" as const),
        id: dispatchService.split(":").slice(1).join(":"),
      }
    : null;

  const toggleOrder = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(orders.map((o) => o.id)) : new Set());
  }

  async function handleDispatch() {
    if (!selectedDispatch || selectedIds.size === 0) return;
    setDispatching(true);
    setResults(null);
    try {
      const res = await fetch("/api/admin/orders/bulk-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: Array.from(selectedIds),
          riderId: selectedDispatch.type === "rider" ? selectedDispatch.id : undefined,
          courierServiceId: selectedDispatch.type === "courier" ? selectedDispatch.id : undefined,
        }),
      });
      const data = (await res.json()) as { results?: DispatchResult[]; error?: string };
      if (!res.ok) { notify.error(data.error ?? "Bulk dispatch failed."); return; }

      const all = data.results ?? [];
      setResults(all);
      const succeeded = all.filter((r) => r.success).length;
      const failed = all.filter((r) => !r.success).length;
      if (succeeded > 0) {
        notify.success(`Dispatched ${succeeded} order${succeeded > 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}.`);
      } else {
        notify.error(`All ${failed} dispatch${failed > 1 ? "es" : ""} failed.`);
      }
      setSelectedIds(new Set());
      setRefreshTick((t) => t + 1);
      onRefresh();
    } catch {
      notify.error("Bulk dispatch failed.");
    } finally {
      setDispatching(false);
    }
  }

  if (!perms.canDispatch) {
    return <p className="text-sm text-muted-foreground">You do not have permission to dispatch orders.</p>;
  }

  const allSelected = orders.length > 0 && selectedIds.size === orders.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <div className="space-y-4">
      {/* Dispatcher selector + dispatch button */}
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border/70 bg-background p-3">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Dispatch via</p>
          <select
            value={dispatchService}
            onChange={(e) => { setDispatchService(e.target.value); setResults(null); }}
            className="h-9 w-[240px] rounded-md border border-border/70 bg-background/90 px-3 text-sm"
          >
            <option value="">Select rider or courier…</option>
            {lookups && lookups.riders.length > 0 && (
              <optgroup label="Riders">
                {lookups.riders.map((r) => (
                  <option key={r.id} value={`rider:${r.id}`}>{r.name ?? r.mobile ?? r.id}</option>
                ))}
              </optgroup>
            )}
            {lookups && lookups.courierServices.length > 0 && (
              <optgroup label="Courier services">
                {lookups.courierServices.map((c) => (
                  <option key={c.id} value={`courier:${c.id}`}>{c.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <Button
          disabled={!selectedDispatch || selectedIds.size === 0 || dispatching}
          onClick={() => void handleDispatch()}
          className="gap-2"
        >
          {dispatching
            ? <Loader2 className="size-4 animate-spin" />
            : <Truck className="size-4" />}
          Dispatch{selectedIds.size > 0 ? ` ${selectedIds.size} order${selectedIds.size > 1 ? "s" : ""}` : " selected"}
        </Button>

        {!selectedDispatch && selectedIds.size > 0 && (
          <p className="text-xs text-muted-foreground">Select a rider or courier first</p>
        )}
      </div>

      {/* Order list */}
      <div className="rounded-md border border-border/70 bg-background">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleAll(!allSelected)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              title={allSelected ? "Deselect all" : "Select all"}
            >
              {allSelected
                ? <CheckSquare className="size-4 text-primary" />
                : someSelected
                  ? <CheckSquare className="size-4 text-muted-foreground" />
                  : <Square className="size-4" />}
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
            </button>
            <span className="text-xs text-muted-foreground">
              — {ordersLoading ? "…" : `${orders.length} ready`}
            </span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders…"
              className="h-8 w-56 pl-9 text-sm"
            />
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/70 backdrop-blur">
              <tr className="border-b border-border/70">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 text-left font-medium">Order</th>
                <th className="px-3 py-2 text-left font-medium">Customer</th>
                <th className="px-3 py-2 text-left font-medium">Location</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {ordersLoading && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!ordersLoading && orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No ready-to-dispatch orders found.
                  </td>
                </tr>
              )}
              {!ordersLoading && orders.map((order) => {
                const isSelected = selectedIds.has(order.id);
                const ref = order.name ?? order.orderNumber ?? order.erpnextInvoiceId ?? order.id;
                const n = parseFloat(order.totalPrice);
                const amount = Number.isNaN(n)
                  ? order.totalPrice
                  : `${n.toLocaleString("en-LK", { minimumFractionDigits: 2 })}${order.currency ? ` ${order.currency}` : ""}`;
                return (
                  <tr
                    key={order.id}
                    onClick={() => toggleOrder(order.id)}
                    className={`cursor-pointer border-b border-border/50 last:border-0 transition-colors hover:bg-muted/20 ${isSelected ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOrder(order.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="size-4 rounded border-border"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium">{ref}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {order.customerPhone ?? order.customerEmail ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {order.companyLocation?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right">{amount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Results */}
      {results && results.length > 0 && (
        <div className="rounded-md border border-border/70 bg-background p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-medium">Dispatch results</p>
            <button type="button" onClick={() => setResults(null)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-1">
            {results.map((r) => (
              <p key={r.orderId} className={r.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                {r.success ? "✓" : "✗"} {r.ref}{r.error ? ` — ${r.error}` : ""}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
