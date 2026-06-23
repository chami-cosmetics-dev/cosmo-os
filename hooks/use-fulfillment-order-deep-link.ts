"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

import type { FulfillmentOrder } from "@/components/organisms/fulfillment-order-selector";
import { mapApiOrderToFulfillmentOrder } from "@/lib/fulfillment-order-map";
import { notify } from "@/lib/notify";
import { TASK_REMINDER_ORDER_ID_PARAM } from "@/lib/task-reminder-links";

export function useFulfillmentOrderDeepLink(
  selectedOrderId: string | null,
  onSelectOrder: (order: FulfillmentOrder | null) => void,
  onPinnedOrder?: (order: FulfillmentOrder | null) => void,
) {
  const searchParams = useSearchParams();
  const deepLinkOrderId = searchParams.get(TASK_REMINDER_ORDER_ID_PARAM)?.trim() ?? null;
  const appliedDeepLinkRef = useRef<string | null>(null);

  useEffect(() => {
    if (!deepLinkOrderId) {
      appliedDeepLinkRef.current = null;
      return;
    }
    if (appliedDeepLinkRef.current === deepLinkOrderId) return;
    if (selectedOrderId === deepLinkOrderId) {
      appliedDeepLinkRef.current = deepLinkOrderId;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${deepLinkOrderId}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          notify.error(data.error ?? "Could not load order from reminder link");
          return;
        }
        const data = (await res.json()) as Parameters<typeof mapApiOrderToFulfillmentOrder>[0];
        if (cancelled) return;
        const order = mapApiOrderToFulfillmentOrder(data);
        onPinnedOrder?.(order);
        onSelectOrder(order);
        appliedDeepLinkRef.current = deepLinkOrderId;
      } catch {
        if (!cancelled) notify.error("Could not load order from reminder link");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deepLinkOrderId, onPinnedOrder, onSelectOrder, selectedOrderId]);
}
