"use client";

import { useState, useCallback } from "react";
import { Truck } from "lucide-react";

import { FulfillmentPermissionsProvider } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentDispatchPanel } from "@/components/organisms/fulfillment-dispatch-panel";
import {
  FulfillmentOrder,
  FulfillmentOrderSelector,
} from "@/components/organisms/fulfillment-order-selector";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";

export function DispatchFulfillmentPage({
  permissions,
}: {
  permissions: FulfillmentPermissions;
}) {
  const [selectedOrder, setSelectedOrder] = useState<FulfillmentOrder | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback((clearSelection?: boolean) => {
    if (clearSelection) setSelectedOrder(null);
    setRefreshTrigger((k) => k + 1);
  }, []);

  return (
    <FulfillmentPermissionsProvider permissions={permissions}>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(135deg,var(--dashboard-hero-start),var(--dashboard-hero-middle),var(--dashboard-hero-end))] p-5 shadow-[0_18px_40px_-28px_var(--primary)] sm:p-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.4),transparent_65%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_65%)]" />
          <p className="text-muted-foreground text-xs font-semibold tracking-[0.18em] uppercase">
            Fulfillment
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            <Truck className="size-5 text-muted-foreground" aria-hidden />
            Ready to Dispatch & Dispatch
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
            Review packaging status, place orders on hold when needed, and dispatch through a rider or courier.
          </p>
        </section>
        <FulfillmentOrderSelector
        title="Ready to Dispatch & Dispatch"
        description="Select an order to put on hold, mark ready, or dispatch via rider or courier."
        stages="print,ready_to_dispatch"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={refreshTrigger}
        currentStage="ready_to_dispatch"
        showHoldStatus
      >
        <FulfillmentDispatchPanel
          orderId={selectedOrder?.id ?? null}
          order={selectedOrder}
          onRefresh={handleRefresh}
        />
      </FulfillmentOrderSelector>
    </div>
    </FulfillmentPermissionsProvider>
  );
}
