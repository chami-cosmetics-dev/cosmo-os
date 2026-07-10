"use client";

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, FileCheck, Loader2, X } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { ErpPaymentModeSelect, ERP_PAYMENT_MODE_ORDER_DEFAULT, resolveErpPaymentModeForApi } from "@/components/molecules/erp-payment-mode-select";
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

type AwaitingInvoiceOrder = {
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

type InvoiceResult = {
  orderId: string;
  ref: string;
  success: boolean;
  error?: string;
  erpPeError?: string;
};

type OrderDetail = {
  id: string;
  customerEmail: string | null;
  customerPhone: string | null;
  resolvedCustomerPhone?: string | null;
  shippingAddress: {
    name?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    phone?: string | null;
  } | null;
  createdAt: string;
  totalShipping: string | null;
  shippingRuleLabel?: string | null;
  currency?: string | null;
  dispatchedAt: string | null;
  deliveryCompleteAt?: string | null;
  dispatchedBy: { name: string | null } | null;
  dispatchedByRider: { name: string | null } | null;
  dispatchedByCourierService: { name: string } | null;
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

interface FulfillmentBulkInvoiceCompleteProps {
  onRefresh: () => void;
  initialOrderId?: string;
}

export function FulfillmentBulkInvoiceComplete({
  onRefresh,
  initialOrderId,
}: FulfillmentBulkInvoiceCompleteProps) {
  const perms = useFulfillmentPermissions();
  const [comboOpen, setComboOpen] = useState(false);
  const [comboSearch, setComboSearch] = useState("");
  const [comboOptions, setComboOptions] = useState<AwaitingInvoiceOrder[]>([]);
  const [comboLoading, setComboLoading] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<AwaitingInvoiceOrder[]>([]);
  const [completing, setCompleting] = useState(false);
  const [results, setResults] = useState<InvoiceResult[] | null>(null);
  const [orderDetails, setOrderDetails] = useState<Record<string, OrderDetail>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [modeOfPayment, setModeOfPayment] = useState(ERP_PAYMENT_MODE_ORDER_DEFAULT);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setComboLoading(true);
      try {
        const params = new URLSearchParams({
          invoice_complete_mode: "true",
          limit: "50",
          sort_by: "delivery_complete",
          sort_order: "desc",
        });
        if (comboSearch.trim()) params.set("search", comboSearch.trim());
        const res = await fetch(`/api/admin/orders/page-data?${params}`);
        if (!res.ok) {
          if (!cancelled) setComboOptions([]);
          return;
        }
        const data = (await res.json()) as { orders?: AwaitingInvoiceOrder[] };
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

  function orderLabel(order: AwaitingInvoiceOrder) {
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

  function addOrder(order: AwaitingInvoiceOrder) {
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

  const readyToComplete = selectedOrders.filter((o) => o.fulfillmentStage === "delivery_complete");

  useEffect(() => {
    if (!initialOrderId || selectedOrders.some((o) => o.id === initialOrderId)) return;
    let cancelled = false;
    fetch(`/api/admin/orders/${initialOrderId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AwaitingInvoiceOrder | null) => {
        if (!cancelled && data?.id) addOrder(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed deep-link order once
  }, [initialOrderId]);

  async function handleInvoiceComplete() {
    if (readyToComplete.length === 0) return;
    setCompleting(true);
    setResults(null);
    const mop = resolveErpPaymentModeForApi(modeOfPayment);
    const payload = mop ? { modeOfPayment: mop } : {};
    try {
      if (readyToComplete.length === 1) {
        const order = readyToComplete[0]!;
        const res = await fetch(`/api/admin/orders/${order.id}/fulfillment`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_invoice_complete", ...payload }),
        });
        const data = (await res.json()) as { error?: string; erpPeError?: string };
        const ref = orderLabel(order);
        if (!res.ok) {
          setResults([{ orderId: order.id, ref, success: false, error: data.error }]);
          notify.error(data.error ?? "Invoice complete failed.");
          return;
        }
        if (data.erpPeError) {
          notify.info(`Invoice complete for ${ref}. ERP PE failed — check Failed ERP Syncs → Payment Entry.`);
          setResults([{ orderId: order.id, ref, success: true, erpPeError: data.erpPeError }]);
        } else if ((data as { peStatus?: string }).peStatus === "already_paid") {
          notify.success(`Invoice complete for ${ref}. ERP Sales Invoice was already paid.`);
          setSelectedOrders((prev) => prev.filter((o) => o.id !== order.id));
        } else {
          notify.success(`Invoice complete for ${ref}. ERP payment entry created.`);
          setSelectedOrders((prev) => prev.filter((o) => o.id !== order.id));
        }
        onRefresh();
        return;
      }

      const res = await fetch("/api/admin/orders/bulk-invoice-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds: readyToComplete.map((o) => o.id),
          ...payload,
        }),
      });
      const data = (await res.json()) as { results?: InvoiceResult[]; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Bulk invoice complete failed.");
        return;
      }

      const all = data.results ?? [];
      setResults(all);
      const succeeded = all.filter((r) => r.success).length;
      const failed = all.filter((r) => !r.success).length;
      const erpWarnings = all.filter((r) => r.success && r.erpPeError).length;

      if (succeeded > 0) {
        const parts = [
          `Invoice complete for ${succeeded} order${succeeded > 1 ? "s" : ""}`,
          failed > 0 ? `${failed} failed` : null,
          erpWarnings > 0 ? `${erpWarnings} ERP PE warning${erpWarnings > 1 ? "s" : ""}` : null,
        ].filter(Boolean);
        notify.success(parts.join(", ") + ".");
        setSelectedOrders((prev) =>
          prev.filter((o) => !all.find((r) => r.orderId === o.id && r.success && !r.erpPeError)),
        );
        onRefresh();
      } else {
        notify.error(`All ${failed} invoice completion${failed > 1 ? "s" : ""} failed.`);
      }
    } catch {
      notify.error("Bulk invoice complete failed.");
    } finally {
      setCompleting(false);
    }
  }

  if (!perms.canMarkInvoiceComplete) {
    return (
      <div className="rounded-md border border-border/70 p-4 text-sm text-muted-foreground">
        You can view this page but need the <span className="font-medium">Mark invoice complete</span> permission to process orders.
      </div>
    );
  }

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
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <FileCheck className="size-5 text-muted-foreground" aria-hidden />
          Invoice complete (finance)
        </h2>
        <p className="text-sm text-muted-foreground">
          Mark delivered orders as invoice complete. By default, each order&apos;s ERP payment entry uses its Vault payment mode (e.g. Cash → Cash). Override below only for special cases.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <div className="space-y-1.5 lg:col-span-2">
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
                Search delivered orders awaiting invoice…
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
                        : "No delivered orders awaiting invoice complete."}
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

        <div className="space-y-1.5">
          <p className="text-sm font-medium">ERP payment mode override (optional)</p>
          <ErpPaymentModeSelect
            value={modeOfPayment}
            onChange={setModeOfPayment}
            disabled={completing}
            allowOrderDefault
          />
        </div>

        <Button
          disabled={readyToComplete.length === 0 || completing}
          onClick={() => void handleInvoiceComplete()}
          className="h-9 gap-2"
        >
          {completing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <FileCheck className="size-4" />
          )}
          {readyToComplete.length > 0
            ? `Invoice complete (${readyToComplete.length})`
            : "Invoice complete"}
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
                onClick={() => {
                  setActiveOrderId(order.id);
                  fetchDetail(order.id);
                }}
                className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs transition-colors ${
                  isActive
                    ? "border-primary bg-primary/10 font-medium text-primary"
                    : "border-border/70 bg-muted/50 hover:border-muted-foreground"
                }`}
              >
                {resultForOrder && (
                  <span
                    className={
                      resultForOrder.success
                        ? resultForOrder.erpPeError
                          ? "text-amber-500"
                          : "text-emerald-500"
                        : "text-destructive"
                    }
                  >
                    {resultForOrder.success ? (resultForOrder.erpPeError ? "!" : "✓") : "✗"}
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

      {activeOrder && (
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
              <span className="font-medium">Phone:</span>{" "}
              {detail?.resolvedCustomerPhone ?? activeOrder.customerPhone ?? "-"}
            </p>
            <p>
              <span className="font-medium">Address:</span> {addrLine || "-"}
            </p>
            <p>
              <span className="font-medium">Payment:</span> {payment.label}
            </p>
          </div>
          <div className="space-y-1">
            <p>
              <span className="font-medium">Total:</span>{" "}
              {Number(activeOrder.totalPrice).toLocaleString("en-LK", { minimumFractionDigits: 2 })}
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
              <span className="font-medium">Dispatched via:</span> {dispatchVia}
            </p>
            <p>
              <span className="font-medium">Delivered at:</span>{" "}
              {detail?.deliveryCompleteAt
                ? new Date(detail.deliveryCompleteAt).toLocaleString("en-LK")
                : "-"}
            </p>
          </div>
        </div>
      )}

      {selectedOrders.length > 0 && readyToComplete.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Selected order(s) are not awaiting invoice complete.
        </p>
      )}

      {results && (results.some((r) => !r.success) || results.some((r) => r.erpPeError)) && (
        <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="font-medium text-destructive">Invoice complete issues</p>
            <button
              type="button"
              onClick={() => setResults(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          {results
            .filter((r) => !r.success || r.erpPeError)
            .map((r) => (
              <p key={r.orderId} className={r.success ? "text-amber-700 dark:text-amber-300" : "text-destructive"}>
                {r.success ? "!" : "✗"} {r.ref}
                {r.error ? ` — ${r.error}` : ""}
                {r.erpPeError ? ` — ERP PE: ${r.erpPeError}` : ""}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
