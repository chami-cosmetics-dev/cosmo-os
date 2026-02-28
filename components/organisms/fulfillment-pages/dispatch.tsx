"use client";

import { useState, useCallback } from "react";

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
