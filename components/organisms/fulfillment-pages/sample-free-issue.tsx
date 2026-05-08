"use client";

import { useState, useCallback } from "react";

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
