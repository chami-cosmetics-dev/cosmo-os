"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronsUpDown, Loader2, Truck, X } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { OrderShippingLine } from "@/components/molecules/order-shipping-line";
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
import {
  DISPATCH_CUSTOMER_PICKUP,
  dispatchSelectionToApiBody,
  parseDispatchService,
} from "@/lib/order-dispatch";
import {
  formatFulfillmentOrderReferenceText,
  fulfillmentOrderSearchTokens,
} from "@/lib/fulfillment-order-reference";
import { notify } from "@/lib/notify";
import { isExplicitlyPackageReady } from "@/lib/fulfillment-stage-display";

type Lookups = {
  courierServices: Array<{ id: string; name: string }>;
  riders: Array<{ id: string; name: string | null; mobile: string | null }>;
  packageHoldReasons: Array<{ id: string; name: string }>;
};

type ReadyOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId?: string | null;
  erpnextInvoiceId: string | null;
  sourceName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  shippingAddress: { phone?: string | null } | null;
  totalPrice: string;
  currency: string | null;
  fulfillmentStage: string;
  paymentGatewayPrimary?: string | null;
  paymentGatewayNames?: string[] | null;
  financialStatus: string | null;
  companyLocation: { id: string; name: string } | null;
  assignedMerchant: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  packageOnHoldAt?: string | null;
  packageReadyAt?: string | null;
  lastPrintedAt?: string | null;
  packageHoldReason?: { id: string; name: string } | null;
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
  shippingRuleLabel?: string | null;
  currency?: string | null;
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
  returned: "Returned",
  ready_to_dispatch: "Ready to Dispatch",
  dispatched: "Dispatched",
};


interface FulfillmentBulkDispatchProps {
  onRefresh: () => void;
  returnFilter?: "normal" | "rearrange";
  refreshTrigger?: number;
  initialOrderId?: string;
}

export function FulfillmentBulkDispatch({
  onRefresh,
  returnFilter = "normal",
  refreshTrigger = 0,
  initialOrderId,
}: FulfillmentBulkDispatchProps) {
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
  const [markingReadyId, setMarkingReadyId] = useState<string | null>(null);
  const [holdBusyId, setHoldBusyId] = useState<string | null>(null);
  const [holdReasonByOrderId, setHoldReasonByOrderId] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/orders/fulfillment-lookups")
      .then((r) => r.json())
      .then((data: Partial<Lookups>) =>
        setLookups({
          courierServices: data.courierServices ?? [],
          riders: data.riders ?? [],
          packageHoldReasons: data.packageHoldReasons ?? [],
        })
      )
      .catch(() => {
        setLookups({ courierServices: [], riders: [], packageHoldReasons: [] });
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setComboLoading(true);
      try {
        const params = new URLSearchParams({ dispatch_mode: "true", limit: "50", sort_by: "last_printed", sort_order: "desc" });
        if (comboSearch.trim()) params.set("search", comboSearch.trim());
        if (returnFilter) params.set("return_filter", returnFilter);
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
  }, [comboSearch, returnFilter, refreshTrigger]);

  const selectedDispatch = parseDispatchService(dispatchService);

  function orderLabel(order: ReadyOrder) {
    return formatFulfillmentOrderReferenceText(order);
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

  async function handleMarkReady(order: ReadyOrder) {
    if (!perms.canMarkReady) return;
    setMarkingReadyId(order.id);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_ready" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Could not mark package ready.");
        return;
      }
      const now = new Date().toISOString();
      setSelectedOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, packageReadyAt: now, packageOnHoldAt: null, packageHoldReason: null }
            : o
        )
      );
      notify.success(`${orderLabel(order)} marked package ready.`);
      onRefresh();
    } catch {
      notify.error("Could not mark package ready.");
    } finally {
      setMarkingReadyId(null);
    }
  }

  async function handlePutOnHold(order: ReadyOrder, holdReasonId: string) {
    if (!perms.canPutOnHold || !holdReasonId) return;
    const reason = lookups?.packageHoldReasons.find((r) => r.id === holdReasonId);
    setHoldBusyId(order.id);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "put_on_hold", holdReasonId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Could not put order on hold.");
        return;
      }
      const now = new Date().toISOString();
      setSelectedOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? {
                ...o,
                packageOnHoldAt: now,
                packageHoldReason: reason ? { id: reason.id, name: reason.name } : null,
                packageReadyAt: null,
              }
            : o
        )
      );
      setHoldReasonByOrderId((prev) => {
        const next = { ...prev };
        delete next[order.id];
        return next;
      });
      notify.success(`${orderLabel(order)} put on hold.`);
      onRefresh();
    } catch {
      notify.error("Could not put order on hold.");
    } finally {
      setHoldBusyId(null);
    }
  }

  async function handleRevertHold(order: ReadyOrder) {
    if (!perms.canRevertHold) return;
    setHoldBusyId(order.id);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revert_hold" }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Could not revert hold.");
        return;
      }
      setSelectedOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, packageOnHoldAt: null, packageHoldReason: null }
            : o
        )
      );
      notify.success(`Hold reverted for ${orderLabel(order)}.`);
      onRefresh();
    } catch {
      notify.error("Could not revert hold.");
    } finally {
      setHoldBusyId(null);
    }
  }

  useEffect(() => {
    if (!initialOrderId || selectedOrders.some((o) => o.id === initialOrderId)) return;
    let cancelled = false;
    fetch(`/api/admin/orders/${initialOrderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ReadyOrder | null) => {
        if (!cancelled && data?.id) addOrder(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed deep-link order once
  }, [initialOrderId]);

  async function handleDispatch() {
    if (!selectedDispatch || selectedOrders.length === 0) return;
    setDispatching(true);
    setResults(null);
    try {
      const dispatchBody = {
        action: "dispatch" as const,
        ...dispatchSelectionToApiBody(selectedDispatch),
      };

      if (selectedOrders.length === 1) {
        const order = selectedOrders[0]!;
        const res = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dispatchBody),
        });
        const data = (await res.json()) as { error?: string };
        const ref = orderLabel(order);
        if (!res.ok) {
          setResults([{ orderId: order.id, ref, success: false, error: data.error }]);
          notify.error(data.error ?? "Dispatch failed.");
          return;
        }
        notify.success("Dispatched.");
        setSelectedOrders([]);
        setActiveOrderId(null);
        onRefresh();
        return;
      }

      const res = await fetch("/api/admin/orders/bulk-dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: selectedOrders.map((o) => o.id),
          ...dispatchSelectionToApiBody(selectedDispatch),
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

  if (!perms.canDispatch && !perms.canPutOnHold && !perms.canMarkReady && !perms.canRevertHold) {
    return null;
  }

  const holdReasons = lookups?.packageHoldReasons ?? [];
  const canShowHoldActions = perms.canPutOnHold || perms.canRevertHold;

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
            <option value="">Select rider, courier, or pickup…</option>
            <option value={DISPATCH_CUSTOMER_PICKUP}>Customer pickup (in-store)</option>
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
                    {comboLoading
                      ? "Loading…"
                      : comboSearch.trim()
                        ? `No order found for "${comboSearch.trim()}".`
                        : "No ready-to-dispatch orders found."}
                  </CommandEmpty>
                  <CommandGroup>
                    {comboLoading && (
                      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Loading…
                      </div>
                    )}
                    {!comboLoading && comboOptions.length === 0 && (
                      <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                        {comboSearch.trim()
                          ? `No order found for "${comboSearch.trim()}".`
                          : "No ready-to-dispatch orders found."}
                      </p>
                    )}
                    {comboOptions.map((order) => {
                      const alreadyAdded = selectedOrders.some((o) => o.id === order.id);
                      return (
                        <CommandItem
                          key={order.id}
                          value={fulfillmentOrderSearchTokens(order)}
                          onSelect={() => addOrder(order)}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="min-w-0 flex-1">
                            <FulfillmentOrderReference order={order} />
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
          disabled={!perms.canDispatch || !selectedDispatch || selectedOrders.length === 0 || dispatching}
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

      {/* Selected orders — each with optional Package Ready */}
      {selectedOrders.length > 0 && (
        <div className="space-y-2 rounded-md border border-border/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Dispatch list</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedOrders([]);
                setActiveOrderId(null);
                setResults(null);
              }}
              disabled={dispatching || markingReadyId !== null || holdBusyId !== null}
              className="h-7 text-xs"
            >
              Clear all
            </Button>
          </div>
          {canShowHoldActions && holdReasons.length === 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              No hold reasons configured. Add them in{" "}
              <Link href="/dashboard/settings/fulfillment" className="underline hover:text-foreground">
                Settings → Fulfillment
              </Link>{" "}
              to use Put on Hold.
            </p>
          )}
          <div className="space-y-2">
            {selectedOrders.map((order) => {
              const isActive = activeOrderId === order.id;
              const resultForOrder = results?.find((r) => r.orderId === order.id);
              const packageReady = isExplicitlyPackageReady({
                packageReadyAt: order.packageReadyAt,
                lastPrintedAt: order.lastPrintedAt,
              });
              const onHold = !!order.packageOnHoldAt;
              const markingReady = markingReadyId === order.id;
              const holdBusy = holdBusyId === order.id;
              const selectedHoldReason = holdReasonByOrderId[order.id] ?? "";

              return (
                <div
                  key={order.id}
                  className={`space-y-2 rounded-md border px-2 py-2 text-xs ${
                    isActive
                      ? "border-primary bg-primary/5"
                      : "border-border/70 bg-muted/30"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectActive(order.id)}
                      className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-1 text-left"
                    >
                      {resultForOrder && (
                        <span className={resultForOrder.success ? "text-emerald-500" : "text-destructive"}>
                          {resultForOrder.success ? "✓" : "✗"}
                        </span>
                      )}
                      <span className="truncate font-medium">{orderLabel(order)}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => removeOrder(order.id)}
                      disabled={dispatching || markingReady || holdBusy}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${orderLabel(order)}`}
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                  {onHold ? (
                    <>
                      <span className="text-amber-600 dark:text-amber-400" title={order.packageHoldReason?.name}>
                        On hold: {order.packageHoldReason?.name ?? "—"}
                      </span>
                      {perms.canRevertHold && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={dispatching || holdBusy || holdBusyId !== null}
                          onClick={() => void handleRevertHold(order)}
                          className="h-7 px-2 text-xs"
                        >
                          {holdBusy ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            "Revert Hold"
                          )}
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      {packageReady ? (
                        <span className="text-emerald-600 dark:text-emerald-400">Package ready</span>
                      ) : perms.canMarkReady ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={
                            dispatching ||
                            markingReady ||
                            markingReadyId !== null ||
                            holdBusyId !== null
                          }
                          onClick={() => void handleMarkReady(order)}
                          className="h-7 px-2 text-xs"
                        >
                          {markingReady ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            "Package Ready"
                          )}
                        </Button>
                      ) : null}

                      {perms.canPutOnHold && (
                        <>
                          <select
                            value={selectedHoldReason}
                            onChange={(e) =>
                              setHoldReasonByOrderId((prev) => ({
                                ...prev,
                                [order.id]: e.target.value,
                              }))
                            }
                            disabled={
                              holdReasons.length === 0 ||
                              dispatching ||
                              holdBusyId !== null ||
                              markingReadyId !== null
                            }
                            className="h-7 min-w-[8rem] max-w-[12rem] rounded-md border border-border/70 bg-background/90 px-2 text-xs"
                            aria-label={`Hold reason for ${orderLabel(order)}`}
                          >
                            <option value="">
                              {holdReasons.length === 0 ? "No hold reasons" : "Hold reason…"}
                            </option>
                            {holdReasons.map((reason) => (
                              <option key={reason.id} value={reason.id}>
                                {reason.name}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={
                              !selectedHoldReason ||
                              holdReasons.length === 0 ||
                              dispatching ||
                              holdBusy ||
                              holdBusyId !== null ||
                              markingReadyId !== null
                            }
                            onClick={() => void handlePutOnHold(order, selectedHoldReason)}
                            className="h-7 px-2 text-xs"
                          >
                            {holdBusy ? (
                              <Loader2 className="size-3.5 animate-spin" aria-hidden />
                            ) : (
                              "Put on Hold"
                            )}
                          </Button>
                        </>
                      )}
                    </>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
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
                {activeOrder ? (
                  <>
                    Order <FulfillmentOrderReference order={activeOrder} variant="inline" />
                  </>
                ) : (
                  "Select an order to fill details"
                )}
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
                <FulfillmentOrderReference order={activeOrder} variant="labeled" />
                <p><span className="font-medium">Email:</span> {activeOrder?.customerEmail ?? "-"}</p>
                <p><span className="font-medium">Phone:</span> {activeOrder?.customerPhone ?? activeOrder?.shippingAddress?.phone ?? "-"}</p>
                <p><span className="font-medium">Address:</span> {addrLine || "-"}</p>
                <p><span className="font-medium">Name:</span> {addr?.name ?? "-"}</p>
              </div>
              <div className="space-y-1">
                <p><span className="font-medium">Order Date:</span> {detail ? new Date(detail.createdAt).toLocaleDateString("en-LK") : "-"}</p>
                <p><span className="font-medium">Total:</span> {activeOrder ? Number(activeOrder.totalPrice).toLocaleString("en-LK", { minimumFractionDigits: 2 }) : "-"}</p>
                <OrderShippingLine
                  prefix="Delivery:"
                  shippingRuleLabel={detail?.shippingRuleLabel}
                  totalShipping={detail?.totalShipping}
                  currency={detail?.currency ?? null}
                  formatPrice={(amount, currency) =>
                    Number(amount).toLocaleString("en-LK", { minimumFractionDigits: 2 }) + (currency ? ` ${currency}` : "")
                  }
                />
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
