"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FulfillmentPermissionsProvider } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentBulkDispatch } from "@/components/organisms/fulfillment-bulk-dispatch";
import { FulfillmentDispatchPanel } from "@/components/organisms/fulfillment-dispatch-panel";
import {
  FulfillmentOrder,
  FulfillmentOrderSelector,
} from "@/components/organisms/fulfillment-order-selector";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { TASK_REMINDER_ORDER_ID_PARAM, TASK_REMINDER_QUEUE_PARAM } from "@/lib/task-reminder-links";

type DispatchMode = "multiple" | "single";
type QueueMode = "normal" | "rearrange";

export function DispatchFulfillmentPage({
  permissions,
}: {
  permissions: FulfillmentPermissions;
}) {
  const [dispatchMode, setDispatchMode] = useState<DispatchMode>("multiple");
  const [selectedOrder, setSelectedOrder] = useState<FulfillmentOrder | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [queueMode, setQueueMode] = useState<QueueMode>("normal");
  const searchParams = useSearchParams();

  useEffect(() => {
    const orderId = searchParams.get(TASK_REMINDER_ORDER_ID_PARAM)?.trim();
    const queue = searchParams.get(TASK_REMINDER_QUEUE_PARAM);
    if (!orderId && queue !== "rearrange") return;
    setDispatchMode("single");
    if (queue === "rearrange") setQueueMode("rearrange");
  }, [searchParams]);

  const handleRefresh = useCallback((clearSelection?: boolean) => {
    if (clearSelection) setSelectedOrder(null);
    setRefreshTrigger((k) => k + 1);
  }, []);

  const switchQueueMode = useCallback((mode: QueueMode) => {
    setQueueMode(mode);
    setSelectedOrder(null);
  }, []);

  return (
    <FulfillmentPermissionsProvider permissions={permissions}>
      <div className="space-y-4">
        {/* Primary dispatch mode tabs */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={dispatchMode === "multiple" ? "default" : "outline"}
            onClick={() => setDispatchMode("multiple")}
          >
            Multiple Dispatch
          </Button>
          <Button
            type="button"
            variant={dispatchMode === "single" ? "default" : "outline"}
            onClick={() => setDispatchMode("single")}
          >
            Single Dispatch
          </Button>
        </div>

        {dispatchMode === "multiple" ? (
          <FulfillmentBulkDispatch onRefresh={() => handleRefresh()} />
        ) : (
          <>
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
                  : "Select an order to put on hold, mark package ready, or dispatch via rider or courier."
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
          </>
        )}
      </div>
    </FulfillmentPermissionsProvider>
  );
}
