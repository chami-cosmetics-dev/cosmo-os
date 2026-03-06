"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

interface FulfillmentPrintPanelProps {
  orderId: string | null;
  order: FulfillmentOrder | null;
  onRefresh?: () => void;
}

export function FulfillmentPrintPanel({ orderId, order }: FulfillmentPrintPanelProps) {
  function handlePrint() {
    if (!orderId) return;
    window.open(`/api/admin/orders/${orderId}/invoice?print=1`, "_blank", "noopener");
  }

  if (!orderId || !order) return null;

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2">
          <Printer className="size-5" />
          Order Print - Order {order.name ?? order.orderNumber ?? order.id}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Print invoice copies for packing and handover. Continue workflow in Ready to Dispatch
          when packaging is complete.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Order
            </p>
            <p className="mt-2 text-sm font-semibold">{order.name ?? order.orderNumber ?? order.id}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Source
            </p>
            <p className="mt-2 text-sm font-semibold">{order.sourceName || "-"}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total
            </p>
            <p className="mt-2 text-sm font-semibold">
              {order.totalPrice} {order.currency ?? ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/80 p-4">
          <p className="text-sm text-muted-foreground">
            After printing, move to <span className="font-medium text-foreground">Ready to Dispatch</span>{" "}
            to mark package status.
          </p>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="size-4" />
            Print Invoice
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
