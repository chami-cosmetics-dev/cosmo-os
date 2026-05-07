"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import { notify } from "@/lib/notify";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

type DeliveryOrderDetail = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  totalPrice: string;
  currency: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
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
  const canMarkInvoiceComplete = stage === "delivery_complete";

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
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Action failed");
        return;
      }
      notify.success("Updated.");
      if (action === "mark_delivered") {
        onRefresh(false, "delivery_complete");
      } else {
        onRefresh(true);
      }
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

  const orderLabel = order ? (order.name ?? order.orderNumber ?? order.id) : "-";
  const currency = detail?.currency ?? order?.currency;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Check className="size-5 text-muted-foreground" aria-hidden />
          Delivery / Invoice
        </h2>
        <p className="text-muted-foreground text-sm">
          {order ? `Order ${orderLabel}` : "Select an order to fill details"}
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
          <p><span className="font-medium">Invoice:</span> {orderLabel}</p>
          <p><span className="font-medium">Email:</span> {detail?.customerEmail ?? order?.customerEmail ?? "-"}</p>
          <p><span className="font-medium">Phone:</span> {detail?.customerPhone ?? order?.customerPhone ?? "-"}</p>
          <p><span className="font-medium">Address:</span> {formatAddress(detail?.shippingAddress)}</p>
        </div>
        <div className="space-y-1">
          <p><span className="font-medium">Order date:</span> {order ? new Date(order.createdAt).toLocaleString("en-LK") : "-"}</p>
          <p><span className="font-medium">Total:</span> {formatPrice(detail?.totalPrice ?? order?.totalPrice, currency)}</p>
          <p><span className="font-medium">Stage:</span> {order?.fulfillmentStage ?? "-"}</p>
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

      {perms.canMarkDelivered || perms.canMarkInvoiceComplete ? (
        <div className="flex flex-wrap gap-2 rounded-md border border-border/70 p-3">
          {perms.canMarkDelivered && (
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
          )}
          {perms.canMarkInvoiceComplete && (
            <Button
              variant="outline"
              onClick={() => doAction("mark_invoice_complete")}
              disabled={!orderId || isBusy || !canMarkInvoiceComplete}
              className="border-border/70 bg-background/85 hover:bg-secondary/10"
            >
              {busyKey === "mark_invoice_complete" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              Mark Invoice Complete
            </Button>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          You do not have permission to mark delivery or invoice complete.
        </p>
      )}
    </div>
  );
}
