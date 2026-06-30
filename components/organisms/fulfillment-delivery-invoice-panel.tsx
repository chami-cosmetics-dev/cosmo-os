"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { OrderShippingLine } from "@/components/molecules/order-shipping-line";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

type DeliveryOrderDetail = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  totalPrice: string;
  currency: string | null;
  merchantCouponCode: string | null;
  discountCouponCode?: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  resolvedCustomerPhone?: string | null;
  shippingAddress: unknown;
  totalShipping?: string | null;
  shippingRuleLabel?: string | null;
  dispatchedAt: string | null;
  dispatchedBy: { id: string; name: string | null; email: string | null } | null;
  dispatchedByRider: { id: string; name: string | null; mobile: string | null } | null;
  dispatchedByCourierService: { id: string; name: string } | null;
  lineItems: Array<{
    id: string;
    productTitle: string;
    variantTitle: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    total: string;
  }>;
};

interface FulfillmentDeliveryInvoicePanelProps {
  orderId: string | null;
  order: FulfillmentOrder | null;
  onRefresh: (clearSelection?: boolean, nextStage?: FulfillmentOrder["fulfillmentStage"]) => void;
}

export function FulfillmentDeliveryInvoicePanel({
  orderId,
  order,
  onRefresh,
}: FulfillmentDeliveryInvoicePanelProps) {
  const perms = useFulfillmentPermissions();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<DeliveryOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const isBusy = busyKey !== null;
  const stage = order?.fulfillmentStage ?? "dispatched";
  const canMarkDelivered = stage === "dispatched";

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setDetailLoading(true);
      fetch(`/api/admin/orders/${orderId}`)
        .then((response) => response.json())
        .then((data) => {
          if (!cancelled) setDetail(data);
        })
        .catch(() => {
          if (!cancelled) setDetail(null);
        })
        .finally(() => {
          if (!cancelled) setDetailLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [orderId]);

  async function doAction(action: string) {
    if (!orderId) return;
    setBusyKey(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as {
        error?: string;
        needsPaymentApproval?: boolean;
      };
      if (!res.ok) {
        notify.error(data.error ?? "Action failed");
        return;
      }
      notify.success(
        data.needsPaymentApproval
          ? "Delivery recorded. Finance can invoice complete from the Invoice Complete tab."
          : "Updated."
      );
      onRefresh(true);
    } catch {
      notify.error("Action failed");
    } finally {
      setBusyKey(null);
    }
  }

  function formatPrice(value?: string | null, currency?: string | null) {
    if (value == null) return "-";
    const amount = Number.parseFloat(value);
    if (Number.isNaN(amount)) return value;
    return amount.toLocaleString("en-LK", { minimumFractionDigits: 2 }) + (currency ? ` ${currency}` : "");
  }

  function formatAddress(addr: unknown) {
    if (!addr || typeof addr !== "object") return "-";
    const a = addr as Record<string, unknown>;
    const parts = [
      a.address1,
      a.address2,
      [a.city, a.province_code].filter(Boolean).join(", "),
      a.country,
      a.zip,
    ].filter(Boolean) as string[];
    return parts.join(", ") || "-";
  }

  const currency = detail?.currency ?? order?.currency;
  const displayPhone = detail?.resolvedCustomerPhone ?? order?.customerPhone ?? "-";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Check className="size-5 text-muted-foreground" aria-hidden />
          Delivery / Invoice
        </h2>
        <p className="text-muted-foreground text-sm">
          {order ? (
            <>
              Order <FulfillmentOrderReference order={order} variant="inline" />
            </>
          ) : (
            "Select an order to fill details"
          )}
        </p>
      </div>

      <div className="relative grid gap-3 rounded-md border border-border/70 p-3 text-sm lg:grid-cols-2">
        {detailLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground shadow-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading order details...
            </div>
          </div>
        )}
        <div className="space-y-1">
          <FulfillmentOrderReference order={order} variant="labeled" />
          <p><span className="font-medium">Email:</span> {detail?.customerEmail ?? order?.customerEmail ?? "-"}</p>
          <p><span className="font-medium">Phone:</span> {displayPhone}</p>
          <p><span className="font-medium">Address:</span> {formatAddress(detail?.shippingAddress)}</p>
          <OrderShippingLine
            prefix="Delivery:"
            shippingRuleLabel={detail?.shippingRuleLabel}
            totalShipping={detail?.totalShipping}
            currency={currency ?? null}
            formatPrice={formatPrice}
          />
          <p>
            <span className="font-medium">Dispatched via:</span>{" "}
            {detail
              ? (detail.dispatchedByRider?.name ?? detail.dispatchedByCourierService?.name ?? detail.dispatchedBy?.name ?? "-")
              : "-"}
          </p>
        </div>
        <div className="space-y-1">
          <p><span className="font-medium">Order date:</span> {order ? new Date(order.createdAt).toLocaleString("en-LK") : "-"}</p>
          <p><span className="font-medium">Total:</span> {formatPrice(detail?.totalPrice ?? order?.totalPrice, currency)}</p>
          {detail?.discountCouponCode && (
            <p><span className="font-medium">Coupon:</span> {detail.discountCouponCode}</p>
          )}
          {detail?.merchantCouponCode && (
            <p><span className="font-medium">Mer coupon:</span> {detail.merchantCouponCode}</p>
          )}
          <p><span className="font-medium">Stage:</span> {order?.fulfillmentStage ?? "-"}</p>
          <p>
            <span className="font-medium">Dispatched at:</span>{" "}
            {detail?.dispatchedAt ? new Date(detail.dispatchedAt).toLocaleString("en-LK") : "-"}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border/70">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="border-b border-border/70">
              <th className="px-3 py-2 text-left font-medium">Item</th>
              <th className="px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-3 py-2 text-right font-medium">Qty</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {(detail?.lineItems ?? []).map((item) => (
              <tr key={item.id} className="border-b border-border/50 last:border-0">
                <td className="px-3 py-2 font-medium">
                  {item.productTitle}
                  {item.variantTitle && <span className="text-muted-foreground"> / {item.variantTitle}</span>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{item.sku ?? "-"}</td>
                <td className="px-3 py-2 text-right">{item.quantity}</td>
                <td className="px-3 py-2 text-right">{formatPrice(item.price, currency)}</td>
                <td className="px-3 py-2 text-right">{formatPrice(item.total, currency)}</td>
              </tr>
            ))}
            {(!detail || detail.lineItems.length === 0) && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                  {order ? "No invoice items loaded." : "Select an order to view items."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {stage === "delivery_complete" && (
        <p className="rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Delivery is complete. Use the <span className="font-medium">Invoice Complete</span> fulfillment tab for finance processing.
        </p>
      )}

      {perms.canMarkDelivered ? (
        <div className="space-y-3 rounded-md border border-border/70 p-3">
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => doAction("mark_delivered")}
              disabled={!orderId || isBusy || !canMarkDelivered}
              className="gap-2"
            >
              {busyKey === "mark_delivered" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Check className="size-4" aria-hidden />
              )}
              Mark Delivered
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          You do not have permission to update delivery or invoice status.
        </p>
      )}
    </div>
  );
}
