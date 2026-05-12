"use client";

import { useState, useCallback } from "react";

import { Button } from "@/components/ui/button";
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
  const [queueMode, setQueueMode] = useState<"normal" | "rearrange">("normal");

  const handleRefresh = useCallback((clearSelection?: boolean) => {
    if (clearSelection) setSelectedOrder(null);
    setRefreshTrigger((k) => k + 1);
  }, []);

  const switchQueueMode = useCallback((mode: "normal" | "rearrange") => {
    setQueueMode(mode);
    setSelectedOrder(null);
  }, []);

  return (
    <FulfillmentPermissionsProvider permissions={permissions}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={queueMode === "normal" ? "default" : "outline"}
            onClick={() => switchQueueMode("normal")}
          >
            Ready to Dispatch
          </Button>
          <Button
            type="button"
            variant={queueMode === "rearrange" ? "default" : "outline"}
            onClick={() => switchQueueMode("rearrange")}
          >
            Rearrange Orders
          </Button>
        </div>
        <FulfillmentOrderSelector
        title={queueMode === "rearrange" ? "Rearrange Orders" : "Ready to Dispatch & Dispatch"}
        description={
          queueMode === "rearrange"
            ? "Returned orders that are ready to dispatch again after sales action."
            : "Select an order to put on hold, mark ready, or dispatch via rider or courier."
        }
        stages="print,ready_to_dispatch"
        selectedOrderId={selectedOrder?.id ?? null}
        onSelectOrder={setSelectedOrder}
        refreshTrigger={refreshTrigger}
        currentStage="ready_to_dispatch"
        returnFilter={queueMode === "rearrange" ? "rearrange" : "normal"}
        showHoldStatus
        showInvoiceDetails={false}
        worksheetMode
        showEmptyWorksheet
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
