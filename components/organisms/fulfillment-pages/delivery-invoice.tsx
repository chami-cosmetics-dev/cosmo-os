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
