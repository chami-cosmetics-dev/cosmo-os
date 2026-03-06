"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { useFulfillmentPermissions } from "@/components/contexts/fulfillment-permissions-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notify } from "@/lib/notify";
import type { FulfillmentOrder } from "./fulfillment-order-selector";

interface FulfillmentDeliveryInvoicePanelProps {
  orderId: string | null;
  order: FulfillmentOrder | null;
  onRefresh: () => void;
}

export function FulfillmentDeliveryInvoicePanel({
  orderId,
  order,
  onRefresh,
}: FulfillmentDeliveryInvoicePanelProps) {
  const perms = useFulfillmentPermissions();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isBusy = busyKey !== null;
  const stage = order?.fulfillmentStage ?? "dispatched";
  const canMarkDelivered = stage === "dispatched";
  const canMarkInvoiceComplete = stage === "delivery_complete";

  async function doAction(action: string) {
    if (!orderId) return;
    setBusyKey(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok) {
        notify.error(data.error ?? "Action failed");
        return;
      }
      notify.success("Updated.");
      onRefresh();
    } catch {
      notify.error("Action failed");
    } finally {
      setBusyKey(null);
    }
  }

  if (!orderId || !order) return null;

  return (
    <Card className="border-border/70 bg-card/95 shadow-sm">
      <CardHeader className="space-y-3">
        <CardTitle className="flex items-center gap-2">
          <Check className="size-5" />
          Delivery Complete & Invoice Complete - Order {order.name ?? order.orderNumber ?? order.id}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          First mark delivery complete when the package is received. Then mark invoice complete to
          finalize the fulfillment cycle.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Current Stage
            </p>
            <p className="mt-2 text-sm font-semibold">{stage || "-"}</p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Delivery Action
            </p>
            <p className="mt-2 text-sm font-semibold">
              {canMarkDelivered ? "Ready to mark delivered" : "Already marked or unavailable"}
            </p>
          </div>
          <div className="rounded-xl border bg-background/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Invoice Action
            </p>
            <p className="mt-2 text-sm font-semibold">
              {canMarkInvoiceComplete ? "Ready to mark invoice complete" : "Waiting for delivery completion"}
            </p>
          </div>
        </div>

        <div className="rounded-xl border bg-background/80 p-4 sm:p-5">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Completion Actions
          </h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Actions are enabled only in the correct sequence to prevent stage mismatch.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => doAction("mark_delivered")} disabled={isBusy || !canMarkDelivered}>
              {busyKey === "mark_delivered" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Mark Delivered
            </Button>
            <Button
              variant="outline"
              onClick={() => doAction("mark_invoice_complete")}
              disabled={isBusy || !canMarkInvoiceComplete}
            >
              {busyKey === "mark_invoice_complete" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Mark Invoice Complete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
