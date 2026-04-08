"use client";

import { useState, useCallback } from "react";
import { Gift } from "lucide-react";

import { FulfillmentPermissionsProvider } from "@/components/contexts/fulfillment-permissions-context";
import {
  FulfillmentOrder,
  FulfillmentOrderSelector,
} from "@/components/organisms/fulfillment-order-selector";
import { FulfillmentSampleFreeIssuePanel } from "@/components/organisms/fulfillment-sample-free-issue-panel";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";

export function SampleFreeIssueFulfillmentPage({
  permissions,
}: {
  permissions: FulfillmentPermissions;
}) {
  const [selectedOrder, setSelectedOrder] = useState<FulfillmentOrder | null>(null);
  const [orderListRefreshTrigger, setOrderListRefreshTrigger] = useState(0);
  const [invoiceRefreshTrigger, setInvoiceRefreshTrigger] = useState(0);

  const handleRefresh = useCallback((clearSelection = true) => {
    if (clearSelection) {
      setSelectedOrder(null);
      setOrderListRefreshTrigger((k) => k + 1);
    } else {
      setInvoiceRefreshTrigger((k) => k + 1);
    }
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
            <Gift className="size-5 text-muted-foreground" aria-hidden />
            Sample / Free Issue
          </h1>
          <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
            Choose an eligible order, add complimentary items, and move it forward once extras are finalized.
          </p>
        </section>
        <FulfillmentOrderSelector
        title="Sample / Free Issue"
        description="Select an order to add samples or free issues. No print option here."
        stages="order_received,sample_free_issue"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={orderListRefreshTrigger}
        invoiceRefreshTrigger={invoiceRefreshTrigger}
        currentStage="sample_free_issue"
      >
        <FulfillmentSampleFreeIssuePanel
          orderId={selectedOrder?.id ?? null}
          order={selectedOrder}
          onRefresh={handleRefresh}
        />
      </FulfillmentOrderSelector>
    </div>
    </FulfillmentPermissionsProvider>
  );
}
