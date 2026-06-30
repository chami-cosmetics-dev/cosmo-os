"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { FulfillmentPermissionsProvider } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentBulkDispatch } from "@/components/organisms/fulfillment-bulk-dispatch";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { TASK_REMINDER_ORDER_ID_PARAM, TASK_REMINDER_QUEUE_PARAM } from "@/lib/task-reminder-links";

type QueueMode = "normal" | "rearrange";

export function DispatchFulfillmentPage({
  permissions,
}: {
  permissions: FulfillmentPermissions;
}) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [queueMode, setQueueMode] = useState<QueueMode>("normal");
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get(TASK_REMINDER_QUEUE_PARAM) === "rearrange") {
      setQueueMode("rearrange");
    }
  }, [searchParams]);

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((k) => k + 1);
  }, []);

  const switchQueueMode = useCallback((mode: QueueMode) => {
    setQueueMode(mode);
  }, []);

  const deepLinkOrderId = searchParams.get(TASK_REMINDER_ORDER_ID_PARAM)?.trim() ?? undefined;

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

        <FulfillmentBulkDispatch
          onRefresh={handleRefresh}
          returnFilter={queueMode}
          refreshTrigger={refreshTrigger}
          initialOrderId={deepLinkOrderId}
        />
      </div>
    </FulfillmentPermissionsProvider>
  );
}
