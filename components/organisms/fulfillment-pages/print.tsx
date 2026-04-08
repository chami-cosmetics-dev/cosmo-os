"use client";

import { useState, useCallback } from "react";
import { Printer } from "lucide-react";

import { FulfillmentPermissionsProvider } from "@/components/contexts/fulfillment-permissions-context";
import {
  FulfillmentOrder,
  FulfillmentOrderSelector,
} from "@/components/organisms/fulfillment-order-selector";
import { FulfillmentPrintPanel } from "@/components/organisms/fulfillment-print-panel";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";

export function PrintFulfillmentPage({
  permissions,
}: {
  permissions: FulfillmentPermissions;
}) {
  const [selectedOrder, setSelectedOrder] = useState<FulfillmentOrder | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(() => {
    setSelectedOrder(null);
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
            <Printer className="size-5 text-muted-foreground" aria-hidden />
            Order Print
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
            Select an order, open the invoice print view, and handle first-time or duplicate prints from one place.
          </p>
        </section>
        <FulfillmentOrderSelector
        title="Order Print"
        description="Select an order to print the invoice. Shows all orders past sample/free issue stage for printing or duplicate copies."
        stages="print,ready_to_dispatch,dispatched,delivery_complete"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={refreshTrigger}
        currentStage="print"
        showPrintStatus
      >
        <FulfillmentPrintPanel
          orderId={selectedOrder?.id ?? null}
          order={selectedOrder}
          onRefresh={handleRefresh}
        />
      </FulfillmentOrderSelector>
    </div>
    </FulfillmentPermissionsProvider>
  );
}
