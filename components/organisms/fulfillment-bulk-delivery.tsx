"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";

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
  formatFulfillmentOrderReferenceText,
  fulfillmentOrderSearchTokens,
} from "@/lib/fulfillment-order-reference";
import { notify } from "@/lib/notify";

type DispatchedOrder = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId?: string | null;
  erpnextInvoiceId: string | null;
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
  createdAt: string;
};

type DeliveryResult = {
  orderId: string;
  ref: string;
  success: boolean;
  error?: string;
  needsPaymentApproval?: boolean;
};

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
  resolvedCustomerPhone?: string | null;
  shippingAddress: ShippingAddress | null;
  createdAt: string;
  totalShipping: string | null;
  shippingRuleLabel?: string | null;
  currency?: string | null;
  totalPrice: string;
  dispatchedAt: string | null;
  dispatchedBy: { name: string | null } | null;
  dispatchedByRider: { name: string | null } | null;
  dispatchedByCourierService: { name: string } | null;
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

interface FulfillmentBulkDeliveryProps {
  onRefresh: () => void;
  initialOrderId?: string;
}

export function FulfillmentBulkDelivery({
  onRefresh,
  initialOrderId,
}: FulfillmentBulkDeliveryProps) {
  const perms = useFulfillmentPermissions();
  const [comboOpen, setComboOpen] = useState(false);
  const [comboSearch, setComboSearch] = useState("");
  const [comboOptions, setComboOptions] = useState<DispatchedOrder[]>([]);
  const [comboLoading, setComboLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<DispatchedOrder[]>([]);
  const [completing, setCompleting] = useState(false);
  const [results, setResults] = useState<DeliveryResult[] | null>(null);
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setComboLoading(true);
      try {
        const params = new URLSearchParams({
          delivery_mode: "true",
          limit: "50",
          sort_by: "dispatched",
          sort_order: "desc",
        });
        if (comboSearch.trim()) params.set("search", comboSearch.trim());
        const res = await fetch(`/api/admin/orders/page-data?${params}`);
        if (!res.ok) {
          if (!cancelled) setComboOptions([]);
          return;
        }
        const data = (await res.json()) as { orders?: DispatchedOrder[] };
        if (!cancelled) setComboOptions(data.orders ?? []);
      } catch {
        if (!cancelled) setComboOptions([]);
      } finally {
        if (!cancelled) setComboLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [comboSearch]);

  function orderLabel(order: DispatchedOrder) {
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

  function addOrder(order: DispatchedOrder) {
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
    setOrderDetails((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setResults(null);
  }

  function selectActive(id: string) {
    setActiveOrderId(id);
    fetchDetail(id);
  }

  useEffect(() => {
    if (!initialOrderId || selectedOrders.some((o) => o.id === initialOrderId)) return;
    let cancelled = false;
    fetch(`/api/admin/orders/${initialOrderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: DispatchedOrder | null) => {
        if (!cancelled && data?.id) addOrder(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed deep-link order once
  }, [initialOrderId]);

  const readyToComplete = selectedOrders.filter((o) => o.fulfillmentStage === "dispatched");

  async function handleCompleteDelivery() {
    if (readyToComplete.length === 0) return;
    setCompleting(true);
    setResults(null);
    try {
      if (readyToComplete.length === 1) {
        const order = readyToComplete[0]!;
        const res = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_delivered" }),
        });
        const data = (await res.json()) as { error?: string; needsPaymentApproval?: boolean };
        const ref = orderLabel(order);
        if (!res.ok) {
          setResults([{ orderId: order.id, ref, success: false, error: data.error }]);
          notify.error(data.error ?? "Delivery complete failed.");
          return;
        }
        notify.success(
          data.needsPaymentApproval
            ? "Delivery recorded. Finance can invoice complete from the Invoice Complete tab."
            : "Marked delivered."
        );
        setSelectedOrders((prev) => prev.filter((o) => o.id !== order.id));
        onRefresh();
        return;
      }

      const res = await fetch("/api/admin/orders/bulk-delivery-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: readyToComplete.map((o) => o.id) }),
      });
      const data = (await res.json()) as { results?: DeliveryResult[]; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Bulk delivery complete failed.");
        return;
      }

      const all = data.results ?? [];
      setResults(all);
      const succeeded = all.filter((r) => r.success).length;
      const failed = all.filter((r) => !r.success).length;
      const awaitingFinance = all.filter((r) => r.success && r.needsPaymentApproval).length;

      if (succeeded > 0) {
        const parts = [
          `Marked ${succeeded} order${succeeded > 1 ? "s" : ""} delivered`,
          failed > 0 ? `${failed} failed` : null,
          awaitingFinance > 0 ? `${awaitingFinance} awaiting finance` : null,
        ].filter(Boolean);
        notify.success(parts.join(", ") + ".");
        setSelectedOrders((prev) =>
          prev.filter((o) => !all.find((r) => r.orderId === o.id && r.success))
        );
        onRefresh();
      } else {
        notify.error(`All ${failed} delivery completion${failed > 1 ? "s" : ""} failed.`);
      }
    } catch {
      notify.error("Bulk delivery complete failed.");
    } finally {
      setCompleting(false);
    }
  }

  if (!perms.canMarkDelivered) return null;

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
  const dispatchVia =
    detail?.dispatchedByRider?.name ??
    detail?.dispatchedByCourierService?.name ??
    detail?.dispatchedBy?.name ??
    "-";

  return (
    <div className="space-y-3 rounded-md border border-border/70 p-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Add orders</p>
          <Popover open={comboOpen} onOpenChange={setComboOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={comboOpen}
                disabled={completing}
                className="h-9 w-full justify-between border-border/70 bg-background font-normal"
              >
                Search dispatched orders…
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
                        : "No dispatched orders found."}
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

        <Button
          disabled={readyToComplete.length === 0 || completing}
          onClick={() => void handleCompleteDelivery()}
          className="h-9 gap-2"
        >
          {completing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          {readyToComplete.length > 0
            ? `Complete ${readyToComplete.length} deliver${readyToComplete.length > 1 ? "ies" : "y"}`
            : "Complete delivery"}
        </Button>
      </div>

      {selectedOrders.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedOrders([]);
              setActiveOrderId(null);
              setResults(null);
            }}
            disabled={completing}
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
                    ? "border-primary bg-primary/10 font-medium text-primary"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    removeOrder(order.id);
                  }}
                  disabled={completing}
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

      <div className="space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Check className="size-5 text-muted-foreground" aria-hidden />
            Delivery & Invoice
          </h2>
          <p className="text-sm text-muted-foreground">
            {activeOrder ? (
              <>
                Order <FulfillmentOrderReference order={activeOrder} variant="inline" />
              </>
            ) : (
              "Add one or more dispatched orders, then complete delivery."
            )}
          </p>
        </div>

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
            <p>
              <span className="font-medium">Email:</span> {activeOrder?.customerEmail ?? "-"}
            </p>
            <p>
              <span className="font-medium">Phone:</span>{" "}
              {detail?.resolvedCustomerPhone ??
                activeOrder?.customerPhone ??
                activeOrder?.shippingAddress?.phone ??
                "-"}
            </p>
            <p>
              <span className="font-medium">Address:</span> {addrLine || "-"}
            </p>
            <p>
              <span className="font-medium">Name:</span> {addr?.name ?? "-"}
            </p>
          </div>
          <div className="space-y-1">
            <p>
              <span className="font-medium">Order Date:</span>{" "}
              {detail ? new Date(detail.createdAt).toLocaleDateString("en-LK") : "-"}
            </p>
            <p>
              <span className="font-medium">Total:</span>{" "}
              {activeOrder
                ? Number(activeOrder.totalPrice).toLocaleString("en-LK", { minimumFractionDigits: 2 })
                : "-"}
            </p>
            <OrderShippingLine
              prefix="Delivery:"
              shippingRuleLabel={detail?.shippingRuleLabel}
              totalShipping={detail?.totalShipping}
              currency={detail?.currency ?? null}
              formatPrice={(amount, currency) =>
                Number(amount).toLocaleString("en-LK", { minimumFractionDigits: 2 }) +
                (currency ? ` ${currency}` : "")
              }
            />
            <p>
              <span className="font-medium">Payment:</span> {activeOrder ? payment.label : "-"}
            </p>
            <p>
              <span className="font-medium">Dispatched via:</span> {activeOrder ? dispatchVia : "-"}
            </p>
            <p>
              <span className="font-medium">Dispatched at:</span>{" "}
              {detail?.dispatchedAt
                ? new Date(detail.dispatchedAt).toLocaleString("en-LK")
                : "-"}
            </p>
        </div>
      </div>

      {activeOrder?.fulfillmentStage === "delivery_complete" && (
        <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          This order is already delivered. Use Invoice complete (finance) below.
        </p>
      )}

      {selectedOrders.length > 0 && readyToComplete.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Selected order(s) are not awaiting delivery completion.
        </p>
      )}

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
            </tbody>
          </table>
        </div>
      </div>

      {results && results.some((r) => !r.success) && (
        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="font-medium text-destructive">Failed deliveries</p>
            <button
              type="button"
              onClick={() => setResults(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {results
            .filter((r) => !r.success)
            .map((r) => (
              <p key={r.orderId} className="text-destructive">
                ✗ {r.ref}
                {r.error ? ` — ${r.error}` : ""}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
