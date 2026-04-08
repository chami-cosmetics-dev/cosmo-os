"use client";

import { useState, useCallback } from "react";
import { CheckCircle2 } from "lucide-react";

import { FulfillmentPermissionsProvider } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentDeliveryInvoicePanel } from "@/components/organisms/fulfillment-delivery-invoice-panel";
import {
  FulfillmentOrder,
  FulfillmentOrderSelector,
} from "@/components/organisms/fulfillment-order-selector";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";

export function DeliveryInvoiceFulfillmentPage({
  permissions,
}: {
  permissions: FulfillmentPermissions;
}) {
  const [selectedOrder, setSelectedOrder] = useState<FulfillmentOrder | null>(null);
  const [orderListRefreshTrigger, setOrderListRefreshTrigger] = useState(0);
  const [invoiceRefreshTrigger, setInvoiceRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(
    (clearSelection = true, nextStage?: FulfillmentOrder["fulfillmentStage"]) => {
      if (clearSelection) {
        setSelectedOrder(null);
        setOrderListRefreshTrigger((k) => k + 1);
        return;
      }

      if (nextStage) {
        setSelectedOrder((current) =>
          current ? { ...current, fulfillmentStage: nextStage } : current
        );
      }
      setOrderListRefreshTrigger((k) => k + 1);
      setInvoiceRefreshTrigger((k) => k + 1);
    },
    []
  );

  return (
    <FulfillmentPermissionsProvider permissions={permissions}>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
            Fulfillment
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <CheckCircle2 className="size-5 text-muted-foreground" aria-hidden />
            Delivery Complete & Invoice Complete
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
            Complete the final fulfillment steps by confirming delivery first and then closing invoice sync.
          </p>
        </section>
        <FulfillmentOrderSelector
        title="Delivery Complete & Invoice Complete"
        description="Select an order. First mark delivery complete when delivered, then mark invoice complete."
        stages="dispatched,delivery_complete"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={orderListRefreshTrigger}
        invoiceRefreshTrigger={invoiceRefreshTrigger}
        currentStage="delivery_complete"
      >
        <FulfillmentDeliveryInvoicePanel
          orderId={selectedOrder?.id ?? null}
          order={selectedOrder}
          onRefresh={handleRefresh}
        />
      </FulfillmentOrderSelector>
    </div>
    </FulfillmentPermissionsProvider>
  );
}
