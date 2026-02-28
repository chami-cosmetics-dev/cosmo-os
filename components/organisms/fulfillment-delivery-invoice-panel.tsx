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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Check className="size-5" />
          Delivery Complete & Invoice Complete — Order {order.name ?? order.orderNumber ?? order.id}
        </CardTitle>
        <p className="text-muted-foreground text-sm">
          First mark delivery complete when delivered, then mark invoice complete (Shopify sync).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {(perms.canMarkDelivered || perms.canMarkInvoiceComplete) ? (
          <div className="flex flex-wrap gap-2">
            {perms.canMarkDelivered && (
              <Button
                onClick={() => doAction("mark_delivered")}
                disabled={isBusy || !canMarkDelivered}
              >
                {busyKey === "mark_delivered" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Mark Delivered
              </Button>
            )}
            {perms.canMarkInvoiceComplete && (
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
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            You do not have permission to mark delivery or invoice complete.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
