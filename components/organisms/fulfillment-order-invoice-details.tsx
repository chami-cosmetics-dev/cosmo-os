"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type OrderDetail = {
  id: string;
  orderNumber: string | null;
  name: string | null;
  totalPrice: string;
  subtotalPrice: string | null;
  totalDiscounts: string | null;
  totalTax: string | null;
  totalShipping: string | null;
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
  sampleFreeIssues?: Array<{
    id: string;
    sampleFreeIssueItem: { id: string; name: string; type: string };
    quantity: number;
  }>;
};

interface FulfillmentOrderInvoiceDetailsProps {
  orderId: string | null;
  refreshTrigger?: number;
}

function formatPrice(val: string, currency?: string | null): string {
  const n = parseFloat(val);
  if (Number.isNaN(n)) return val;
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2 }) + (currency ? ` ${currency}` : "");
}

function formatAddress(addr: unknown): string {
  if (!addr || typeof addr !== "object") return "—";
  const a = addr as Record<string, unknown>;
  const parts = [
    a.address1,
    a.address2,
    [a.city, a.province_code].filter(Boolean).join(", "),
    a.country,
    a.zip,
  ].filter(Boolean) as string[];
  return parts.join(", ") || "—";
}

export function FulfillmentOrderInvoiceDetails({
  orderId,
  refreshTrigger = 0,
}: FulfillmentOrderInvoiceDetailsProps) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const prevOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setDetail(null);
      setLoading(false);
      prevOrderIdRef.current = null;
      return;
    }
    const isSameOrder = prevOrderIdRef.current === orderId;
    prevOrderIdRef.current = orderId;
    if (!isSameOrder) {
      setDetail(null);
      setLoading(true);
    }
    fetch(`/api/admin/orders/${orderId}`)
      .then((r) => r.json())
      .then((data) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [orderId, refreshTrigger]);

  if (!orderId) return null;

  if (loading && !detail) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!detail) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invoice Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 font-medium text-muted-foreground">Customer</h4>
            <p>{detail.customerEmail ?? detail.customerPhone ?? "—"}</p>
            {detail.customerPhone && detail.customerEmail && (
              <p className="text-muted-foreground">{detail.customerPhone}</p>
            )}
          </div>
          <div>
            <h4 className="mb-1 font-medium text-muted-foreground">Shipping</h4>
            <p className="line-clamp-2">{formatAddress(detail.shippingAddress)}</p>
          </div>
        </div>
        {detail.sampleFreeIssues && detail.sampleFreeIssues.length > 0 && (
          <div>
            <h4 className="mb-2 font-medium text-muted-foreground">Samples / Free Issues</h4>
            <ul className="rounded border p-3">
              {detail.sampleFreeIssues.map((s) => (
                <li key={s.id} className="flex justify-between py-1">
                  <span>
                    {s.sampleFreeIssueItem.name}
                    <span className="text-muted-foreground"> ({s.sampleFreeIssueItem.type})</span>
                  </span>
                  <span>× {s.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h4 className="mb-2 font-medium text-muted-foreground">Line Items</h4>
          <div className="rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium">Product</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {detail.lineItems.map((li) => (
                  <tr key={li.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {li.productTitle}
                      {li.variantTitle && (
                        <span className="text-muted-foreground"> / {li.variantTitle}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{li.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      {formatPrice(li.price, detail.currency)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatPrice(li.total, detail.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 space-y-1 text-right">
            {detail.subtotalPrice != null && (
              <p>
                Subtotal: {formatPrice(detail.subtotalPrice, detail.currency)}
              </p>
            )}
            {detail.totalDiscounts != null && parseFloat(detail.totalDiscounts) > 0 && (
              <p>Discounts: -{formatPrice(detail.totalDiscounts, detail.currency)}</p>
            )}
            {detail.totalShipping != null && parseFloat(detail.totalShipping) > 0 && (
              <p>Shipping: {formatPrice(detail.totalShipping, detail.currency)}</p>
            )}
            {detail.totalTax != null && parseFloat(detail.totalTax) > 0 && (
              <p>Tax: {formatPrice(detail.totalTax, detail.currency)}</p>
            )}
            <p className="font-medium">
              Total: {formatPrice(detail.totalPrice, detail.currency)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
