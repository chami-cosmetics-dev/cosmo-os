"use client";

import { useState, useCallback } from "react";

import { FulfillmentDeliveryInvoicePanel } from "@/components/organisms/fulfillment-delivery-invoice-panel";
import { FulfillmentOrderSelector } from "@/components/organisms/fulfillment-order-selector";

export function DeliveryInvoiceFulfillmentPage() {
  const [selectedOrder, setSelectedOrder] = useState<{
    id: string;
    orderNumber: string | null;
    name: string | null;
    sourceName: string;
    totalPrice: string;
    currency: string | null;
    createdAt: string;
    companyLocation: { id: string; name: string } | null;
  } | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = useCallback(() => {
    setSelectedOrder(null);
    setRefreshTrigger((k) => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      <FulfillmentOrderSelector
        title="Delivery Complete & Invoice Complete"
        description="Select an order. First mark delivery complete when delivered, then mark invoice complete."
        stages="dispatched,delivery_complete"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={refreshTrigger}
      >
        <FulfillmentDeliveryInvoicePanel
          orderId={selectedOrder?.id ?? null}
          order={selectedOrder}
          onRefresh={handleRefresh}
        />
      </FulfillmentOrderSelector>
    </div>
  );
}
