"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentOrderReference } from "@/components/molecules/fulfillment-order-reference";
import { OrderShippingLine } from "@/components/molecules/order-shipping-line";
import { Button } from "@/components/ui/button";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

interface FulfillmentPrintPanelProps {
  orderId: string | null;
  order: FulfillmentOrder | null;
  onRefresh?: () => void;
}

type PrintOrderDetail = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  totalPrice: string;
  currency: string | null;
  merchantCouponCode: string | null;
  discountCouponCode?: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: unknown;
  totalShipping?: string | null;
  shippingRuleLabel?: string | null;
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

export function FulfillmentPrintPanel({ orderId, order }: FulfillmentPrintPanelProps) {
  const perms = useFulfillmentPermissions();
  const [detail, setDetail] = useState<PrintOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);

  function handlePrint() {
    if (!orderId) return;
    window.open(`/api/admin/orders/${orderId}/invoice?print=1`, "_blank", "noopener");
  }

  useEffect(() => {
    if (!orderId) {
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/orders/${orderId}`)
        .then((response) => response.json())
        .then((data) => {
          if (!cancelled) setDetail(data);
        })
        .catch(() => {
          if (!cancelled) setDetail(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [orderId]);

  const currency = detail?.currency ?? order?.currency;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Printer className="size-5 text-muted-foreground" aria-hidden />
          Order Print
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
      {loading && !detail ? (
        <div className="rounded-md border border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground">
          Loading order details...
        </div>
      ) : (
        <>
          <div className="grid gap-3 rounded-md border border-border/70 p-3 text-sm lg:grid-cols-2">
            <div className="space-y-1">
              <FulfillmentOrderReference order={order} variant="labeled" />
              <p><span className="font-medium">Email:</span> {detail?.customerEmail ?? order?.customerEmail ?? "-"}</p>
              <p><span className="font-medium">Phone:</span> {detail?.customerPhone ?? order?.customerPhone ?? "-"}</p>
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
              <p><span className="font-medium">Address:</span> {formatAddress(detail?.shippingAddress)}</p>
              <OrderShippingLine
                prefix="Delivery:"
                shippingRuleLabel={detail?.shippingRuleLabel}
                totalShipping={detail?.totalShipping}
                currency={currency}
                formatPrice={formatPrice}
              />
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
        </>
      )}
      {perms.canPrint ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 p-3">
          <p className="text-muted-foreground text-sm">Open the invoice and print it.</p>
          <Button onClick={handlePrint} disabled={!orderId} className="gap-2">
            <Printer className="size-4" aria-hidden />
            Print Invoice
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">You do not have permission to print invoices.</p>
      )}
    </div>
  );
}
