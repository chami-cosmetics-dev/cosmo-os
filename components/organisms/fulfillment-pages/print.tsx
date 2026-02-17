"use client";

import { useState, useCallback } from "react";

import {
  FulfillmentOrder,
  FulfillmentOrderSelector,
} from "@/components/organisms/fulfillment-order-selector";
import { FulfillmentPrintPanel } from "@/components/organisms/fulfillment-print-panel";

export function PrintFulfillmentPage() {
  const [selectedOrder, setSelectedOrder] = useState<FulfillmentOrder | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(() => {
    setSelectedOrder(null);
    setRefreshTrigger((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      <FulfillmentOrderSelector
        title="Order Print"
        description="Select an order to print the invoice. Shows all orders past sample/free issue stage for printing or duplicate copies."
        stages="print,ready_to_dispatch,dispatched,delivery_complete"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={refreshTrigger}
        showPrintStatus
      >
        <FulfillmentPrintPanel
          orderId={selectedOrder?.id ?? null}
          order={selectedOrder}
          onRefresh={handleRefresh}
        />
      </FulfillmentOrderSelector>
    </div>
  );
}
