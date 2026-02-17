"use client";

import { useState, useCallback } from "react";

import { FulfillmentDispatchPanel } from "@/components/organisms/fulfillment-dispatch-panel";
import {
  FulfillmentOrder,
  FulfillmentOrderSelector,
} from "@/components/organisms/fulfillment-order-selector";

export function DispatchFulfillmentPage() {
  const [selectedOrder, setSelectedOrder] = useState<FulfillmentOrder | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback((clearSelection?: boolean) => {
    if (clearSelection) setSelectedOrder(null);
    setRefreshTrigger((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      <FulfillmentOrderSelector
        title="Ready to Dispatch & Dispatch"
        description="Select an order to put on hold, mark ready, or dispatch via rider or courier."
        stages="print,ready_to_dispatch"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={refreshTrigger}
        showHoldStatus
      >
        <FulfillmentDispatchPanel
          orderId={selectedOrder?.id ?? null}
          order={selectedOrder}
          onRefresh={handleRefresh}
        />
      </FulfillmentOrderSelector>
    </div>
  );
}
