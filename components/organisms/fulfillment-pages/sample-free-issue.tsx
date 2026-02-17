"use client";

import { useState, useCallback } from "react";

import { FulfillmentOrderSelector } from "@/components/organisms/fulfillment-order-selector";
import { FulfillmentSampleFreeIssuePanel } from "@/components/organisms/fulfillment-sample-free-issue-panel";

export function SampleFreeIssueFulfillmentPage() {
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
    <div className="space-y-6">
      <FulfillmentOrderSelector
        title="Sample / Free Issue"
        description="Select an order to add samples or free issues. No print option here."
        stages="order_received,sample_free_issue"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={orderListRefreshTrigger}
        invoiceRefreshTrigger={invoiceRefreshTrigger}
      >
        <FulfillmentSampleFreeIssuePanel
          orderId={selectedOrder?.id ?? null}
          order={selectedOrder}
          onRefresh={handleRefresh}
        />
      </FulfillmentOrderSelector>
    </div>
  );
}
