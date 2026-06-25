"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import { FulfillmentPermissionsProvider } from "@/components/contexts/fulfillment-permissions-context";
import { FulfillmentBulkDelivery } from "@/components/organisms/fulfillment-bulk-delivery";
import type { FulfillmentPermissions } from "@/lib/fulfillment-permissions";
import { TASK_REMINDER_ORDER_ID_PARAM } from "@/lib/task-reminder-links";

export function DeliveryInvoiceFulfillmentPage({
  permissions,
}: {
  permissions: FulfillmentPermissions;
}) {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const searchParams = useSearchParams();
  const deepLinkOrderId = searchParams.get(TASK_REMINDER_ORDER_ID_PARAM)?.trim() ?? undefined;

  const handleRefresh = useCallback(() => {
    setRefreshTrigger((k) => k + 1);
  }, []);

  return (
    <FulfillmentPermissionsProvider permissions={permissions}>
      <div className="space-y-4">
        <FulfillmentBulkDelivery
          key={refreshTrigger}
          onRefresh={handleRefresh}
          initialOrderId={deepLinkOrderId}
        />
      </div>
    </FulfillmentPermissionsProvider>
  );
}
