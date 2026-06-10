import { useCallback, useMemo, useState } from "react";
import { apiClient } from "@/src/api/client";
import { useRefreshOnFocus } from "@/src/hooks/use-refresh-on-focus";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import type { MobileDeliveriesResponse, MobileDelivery } from "@/src/types";
import { isRenderableDelivery } from "@/src/utils/delivery";

const ACTIVE_STATUSES = new Set(["assigned", "accepted", "arrived"]);

export function useDeliveries() {
  const { completedDeliveries } = useCompletedDeliveries();
  const [deliveries, setDeliveries] = useState<MobileDelivery[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiClient.get<MobileDeliveriesResponse>("/api/mobile/v1/deliveries");
      setDeliveries(data.deliveries);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliveries");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useRefreshOnFocus(reload);

  const activeDeliveries = useMemo(() => {
    const completedIds = new Set(completedDeliveries.map((delivery) => delivery.id));
    return deliveries.filter(
      (delivery) =>
        isRenderableDelivery(delivery) &&
        ACTIVE_STATUSES.has(delivery.deliveryStatus) &&
        !completedIds.has(delivery.id)
    );
  }, [completedDeliveries, deliveries]);

  return {
    deliveries,
    activeDeliveries,
    refreshing,
    error,
    reload,
  };
}
