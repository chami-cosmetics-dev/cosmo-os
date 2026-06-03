"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Truck, X } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [comboOpen, setComboOpen] = useState(false);
  const [comboSearch, setComboSearch] = useState("");
  const [comboOptions, setComboOptions] = useState<ReadyOrder[]>([]);
  const [comboLoading, setComboLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<ReadyOrder[]>([]);
  const [dispatching, setDispatching] = useState(false);
  const [results, setResults] = useState<DispatchResult[] | null>(null);

  useEffect(() => {
    fetch("/api/admin/orders/fulfillment-lookups")
      .then((r) => r.json())
      .then((data: Lookups) => setLookups(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setComboLoading(true);
      try {
        const params = new URLSearchParams({ fulfillmentStages: "order_received,sample_free_issue,ready_to_dispatch", pageSize: "30" });
        if (comboSearch.trim()) params.set("search", comboSearch.trim());
        const res = await fetch(`/api/admin/orders/page-data?${params}`);
        if (!res.ok) { if (!cancelled) setComboOptions([]); return; }
        const data = (await res.json()) as { orders?: ReadyOrder[] };
        if (!cancelled) setComboOptions(data.orders ?? []);
      } catch {
        if (!cancelled) setComboOptions([]);
      } finally {
        if (!cancelled) setComboLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [comboSearch]);

  const selectedDispatch = dispatchService
    ? {
        type: dispatchService.startsWith("rider:") ? ("rider" as const) : ("courier" as const),
        id: dispatchService.split(":").slice(1).join(":"),
      }
    : null;

  function orderLabel(order: ReadyOrder) {
    return order.name ?? order.orderNumber ?? order.erpnextInvoiceId ?? order.id;
  }

  function addOrder(order: ReadyOrder) {
    setSelectedOrders((prev) =>
      prev.some((o) => o.id === order.id) ? prev : [...prev, order]
    );
    setResults(null);
    setComboOpen(false);
    setComboSearch("");
  }

  function removeOrder(id: string) {
    setSelectedOrders((prev) => prev.filter((o) => o.id !== id));
    setResults(null);
  }

  async function handleDispatch() {
    if (!selectedDispatch || selectedOrders.length === 0) return;
    setDispatching(true);
    setResults(null);
    try {
      const res = await fetch("/api/admin/orders/bulk-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: selectedOrders.map((o) => o.id),
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
        setSelectedOrders((prev) => prev.filter((o) => !all.find((r) => r.orderId === o.id && r.success)));
        onRefresh();
      } else {
        notify.error(`All ${failed} dispatch${failed > 1 ? "es" : ""} failed.`);
      }
    } catch {
      notify.error("Bulk dispatch failed.");
    } finally {
      setDispatching(false);
    }
  }

  if (!perms.canDispatch) return null;

  return (
    <div className="space-y-3 rounded-md border border-border/70 p-3">
      <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)_auto] lg:items-end">
        {/* Rider / courier selector */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Dispatch via</p>
          <select
            value={dispatchService}
            onChange={(e) => { setDispatchService(e.target.value); setResults(null); }}
            disabled={dispatching}
            className="h-9 w-full rounded-md border border-border/70 bg-background/90 px-3 text-sm"
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

        {/* Order combobox */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Add orders</p>
          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={comboOpen}
                disabled={dispatching}
                className="h-9 w-full justify-between border-border/70 bg-background font-normal"
              >
                Search ready-to-dispatch orders…
                <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(640px,calc(100vw-2rem))] border-border/70 p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search invoice, customer, phone…"
                  value={comboSearch}
                  onValueChange={setComboSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    {comboLoading ? "Loading…" : "No ready-to-dispatch orders found."}
                  </CommandEmpty>
                  <CommandGroup>
                    {comboLoading && (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Loading…
                      </div>
                    )}
                    {comboOptions.map((order) => {
                      const alreadyAdded = selectedOrders.some((o) => o.id === order.id);
                      return (
                        <CommandItem
                          key={order.id}
                          value={`${order.name ?? ""} ${order.orderNumber ?? ""}`}
                          onSelect={() => addOrder(order)}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{orderLabel(order)}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {order.companyLocation?.name ?? "No location"}
                              {" | "}
                              {order.customerPhone ?? order.customerEmail ?? "No contact"}
                            </span>
                          </span>
                          {alreadyAdded && <Check className="size-4 shrink-0" aria-hidden />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Dispatch button */}
        <Button
          disabled={!selectedDispatch || selectedOrders.length === 0 || dispatching}
          onClick={() => void handleDispatch()}
          className="h-9 gap-2"
        >
          {dispatching
            ? <Loader2 className="size-4 animate-spin" />
            : <Truck className="size-4" />}
          {selectedOrders.length > 0
            ? `Dispatch ${selectedOrders.length} order${selectedOrders.length > 1 ? "s" : ""}`
            : "Dispatch"}
        </Button>
      </div>

      {/* Selected order chips */}
      {selectedOrders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setSelectedOrders([]); setResults(null); }}
            disabled={dispatching}
            className="h-7 text-xs"
          >
            Clear all
          </Button>
          {selectedOrders.map((order) => (
            <span
              key={order.id}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-border/70 bg-muted/50 px-2 text-xs"
            >
              {orderLabel(order)}
              <button
                type="button"
                onClick={() => removeOrder(order.id)}
                disabled={dispatching}
                className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                aria-label={`Remove ${orderLabel(order)}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Results */}
      {results && results.length > 0 && (
        <div className="space-y-1 rounded-md border border-border/70 bg-background p-3 text-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="font-medium">Dispatch results</p>
            <button type="button" onClick={() => setResults(null)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {results.map((r) => (
            <p key={r.orderId} className={r.success ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
              {r.success ? "✓" : "✗"} {r.ref}{r.error ? ` — ${r.error}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
