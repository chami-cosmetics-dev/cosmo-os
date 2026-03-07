"use client";

import { useState, useCallback } from "react";

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
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(() => {
    setSelectedOrder(null);
    setRefreshTrigger((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card/95 p-5 shadow-sm sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Delivery & Invoice Completion</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete delivery first, then mark invoice completion to finalize the order lifecycle.
        </p>
      </div>
      <FulfillmentOrderSelector
        title="Delivery Complete & Invoice Complete"
        description="Select an order. First mark delivery complete when delivered, then mark invoice complete."
        stages="dispatched,delivery_complete"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={refreshTrigger}
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
