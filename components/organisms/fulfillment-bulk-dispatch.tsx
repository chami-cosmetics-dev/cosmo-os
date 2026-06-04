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
import { getPaymentMethodInfo } from "@/lib/payment-method-label";
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
  totalPrice: string;
  currency: string | null;
  fulfillmentStage: string;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  financialStatus: string | null;
  companyLocation: { id: string; name: string } | null;
};

type DispatchResult = { orderId: string; ref: string; success: boolean; error?: string };

type ShippingAddress = {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  phone?: string | null;
};

type OrderDetail = {
  id: string;
  name: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: ShippingAddress | null;
  createdAt: string;
  totalShipping: string | null;
  totalPrice: string;
  discountCodes: Array<{ code: string }> | null;
  lineItems: Array<{
    id: string;
    productTitle: string | null;
    variantTitle: string | null;
    sku: string | null;
    brand: string | null;
    category: string | null;
    subCategory: string | null;
    quantity: number;
    price: string;
    total: string;
  }>;
};

const STAGE_LABEL: Record<string, string> = {
  order_received: "Order Received",
  sample_free_issue: "Sample / Free Issue",
  print: "Print",
  returned_to_store: "Returned to Store",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
};


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
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

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

  function fetchDetail(orderId: string) {
    if (orderDetails[orderId] || detailLoading[orderId]) return;
    setDetailLoading((prev) => ({ ...prev, [orderId]: true }));
    fetch(`/api/admin/orders/${orderId}`)
      .then((r) => r.json())
      .then((data: OrderDetail) => setOrderDetails((prev) => ({ ...prev, [orderId]: data })))
      .catch(() => {})
      .finally(() => setDetailLoading((prev) => ({ ...prev, [orderId]: false })));
  }

  function addOrder(order: ReadyOrder) {
    if (selectedOrders.some((o) => o.id === order.id)) {
      setActiveOrderId(order.id);
      return;
    }
    setSelectedOrders((prev) => [...prev, order]);
    setActiveOrderId(order.id);
    setResults(null);
    setComboOpen(false);
    setComboSearch("");
    fetchDetail(order.id);
  }

  function removeOrder(id: string) {
    setSelectedOrders((prev) => {
      const next = prev.filter((o) => o.id !== id);
      if (activeOrderId === id) setActiveOrderId(next[next.length - 1]?.id ?? null);
      return next;
    });
    setOrderDetails((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setResults(null);
  }

  function selectActive(id: string) {
    setActiveOrderId(id);
    fetchDetail(id);
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

      {/* Chips row — only when orders are selected */}
      {selectedOrders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setSelectedOrders([]); setActiveOrderId(null); setResults(null); }}
            disabled={dispatching}
            className="h-7 text-xs"
          >
            Clear all
          </Button>
          {selectedOrders.map((order) => {
            const isActive = activeOrderId === order.id;
            const resultForOrder = results?.find((r) => r.orderId === order.id);
            return (
              <span
                key={order.id}
                onClick={() => selectActive(order.id)}
                className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border/70 bg-muted/50 hover:border-muted-foreground"
                }`}
              >
                {resultForOrder && (
                  <span className={resultForOrder.success ? "text-emerald-500" : "text-destructive"}>
                    {resultForOrder.success ? "✓" : "✗"}
                  </span>
                )}
                {orderLabel(order)}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeOrder(order.id); }}
                  disabled={dispatching}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${orderLabel(order)}`}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Detail panel — always visible, static structure, data swaps per active order */}
      {(() => {
        const activeOrder = selectedOrders.find((o) => o.id === activeOrderId) ?? null;
        const detail = activeOrderId ? (orderDetails[activeOrderId] ?? null) : null;
        const loading = activeOrderId ? (detailLoading[activeOrderId] ?? false) : false;
        const payment = getPaymentMethodInfo({
          paymentGatewayPrimary: activeOrder?.paymentGatewayPrimary,
          paymentGatewayNames: activeOrder?.paymentGatewayNames,
          financialStatus: activeOrder?.financialStatus,
        });
        const addr = detail?.shippingAddress;
        const addrLine = [addr?.address1, addr?.address2, addr?.city].filter(Boolean).join(", ");
        const coupons = detail?.discountCodes?.map((d) => d.code).filter(Boolean) ?? [];

        return (
          <div className="space-y-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Truck className="size-5 text-muted-foreground" aria-hidden />
                Dispatch
              </h2>
              <p className="text-muted-foreground text-sm">
                {activeOrder ? `Order ${orderLabel(activeOrder)}` : "Select an order to fill details"}
              </p>
            </div>

            {/* Meta grid — always rendered */}
            <div className="relative grid gap-3 rounded-md border border-border/70 p-3 text-sm lg:grid-cols-2">
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/70">
                  <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading order details…
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <p><span className="font-medium">Invoice:</span> {activeOrder ? orderLabel(activeOrder) : "-"}</p>
                <p><span className="font-medium">Email:</span> {activeOrder?.customerEmail ?? "-"}</p>
                <p><span className="font-medium">Phone:</span> {activeOrder?.customerPhone ?? "-"}</p>
                <p><span className="font-medium">Address:</span> {addrLine || "-"}</p>
                <p><span className="font-medium">Name:</span> {addr?.name ?? "-"}</p>
              </div>
              <div className="space-y-1">
                <p><span className="font-medium">Order Date:</span> {detail ? new Date(detail.createdAt).toLocaleDateString("en-LK") : "-"}</p>
                <p><span className="font-medium">Total:</span> {activeOrder ? Number(activeOrder.totalPrice).toLocaleString("en-LK", { minimumFractionDigits: 2 }) : "-"}</p>
                <p><span className="font-medium">Shipping:</span> {detail?.totalShipping ? Number(detail.totalShipping).toLocaleString("en-LK", { minimumFractionDigits: 2 }) : "-"}</p>
                <p><span className="font-medium">Payment:</span> {activeOrder ? payment.label : "-"}</p>
                <p><span className="font-medium">Stage:</span> {activeOrder ? (STAGE_LABEL[activeOrder.fulfillmentStage] ?? activeOrder.fulfillmentStage) : "-"}</p>
              </div>
            </div>

            {/* Items table — always rendered */}
            <div className="overflow-hidden rounded-md border border-border/70">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="border-b border-border/70">
                    <th className="px-3 py-2 text-left font-medium">Brand</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-left font-medium">Sub Category</th>
                    <th className="px-3 py-2 text-left font-medium">Code</th>
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">U.Price</th>
                    <th className="px-3 py-2 text-right font-medium">Sub Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detail?.lineItems?.map((li) => (
                    <tr key={li.id} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">{li.brand ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{li.category ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{li.subCategory ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{li.sku ?? "—"}</td>
                      <td className="px-3 py-2 font-medium">
                        {li.productTitle}
                        {li.variantTitle && li.variantTitle !== "Default Title" && (
                          <span className="text-muted-foreground"> / {li.variantTitle}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{li.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {Number(li.price).toLocaleString("en-LK", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {Number(li.total).toLocaleString("en-LK", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {(!detail || !detail.lineItems?.length) && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                        {activeOrder ? "Loading items…" : "Select an order to view items."}
                      </td>
                    </tr>
                  )}
                  {detail?.lineItems && detail.lineItems.length > 0 && (
                    <tr className="border-t border-border/70 bg-muted/20 font-medium">
                      <td colSpan={5} className="px-3 py-2 text-right text-muted-foreground text-xs">
                        {coupons.length > 0 && <span className="mr-4">Coupon: {coupons.join(", ")}</span>}
                        Total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {detail.lineItems.reduce((s, li) => s + li.quantity, 0)}
                      </td>
                      <td />
                      <td className="px-3 py-2 text-right tabular-nums">
                        {activeOrder ? Number(activeOrder.totalPrice).toLocaleString("en-LK", { minimumFractionDigits: 2 }) : ""}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Results summary (failures only — successes shown inline in table) */}
      {results && results.some((r) => !r.success) && (
        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="font-medium text-destructive">Failed dispatches</p>
            <button type="button" onClick={() => setResults(null)} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {results.filter((r) => !r.success).map((r) => (
            <p key={r.orderId} className="text-destructive">
              ✗ {r.ref}{r.error ? ` — ${r.error}` : ""}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
