import { useCallback, useMemo, useState } from "react";
import { apiClient } from "@/src/api/client";
import { useRefreshOnFocus } from "@/src/hooks/use-refresh-on-focus";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { useAuth } from "@/src/providers/auth";
import { getDeliveryKey } from "@/src/tenants/config";
import { getConfiguredTenants } from "@/src/tenants";
import type { MobileDeliveriesResponse, TenantMobileDelivery } from "@/src/types";
import { isRenderableDelivery } from "@/src/utils/delivery";

const ACTIVE_STATUSES = new Set(["assigned", "accepted", "arrived"]);

export function useDeliveries() {
  const { activeTenantIds } = useAuth();
  const { completedDeliveries } = useCompletedDeliveries();
  const [deliveries, setDeliveries] = useState<TenantMobileDelivery[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const tenants = getConfiguredTenants().filter((tenant) => activeTenantIds.includes(tenant.id));
      const responses = await Promise.all(
        tenants.map(async (tenant) => {
          try {
            const data = await apiClient.get<MobileDeliveriesResponse>(tenant.id, "/api/mobile/v1/deliveries");
            return data.deliveries.map((delivery) => ({
              ...delivery,
              tenant: tenant.id,
              companyLabel: tenant.label,
            }));
          } catch {
            return [];
          }
        })
      );

      setDeliveries(responses.flat());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load deliveries");
    } finally {
      setRefreshing(false);
    }
  }, [activeTenantIds]);

  useRefreshOnFocus(reload, [activeTenantIds]);

  const activeDeliveries = useMemo(() => {
    const completedKeys = new Set(
      completedDeliveries.map((delivery) => getDeliveryKey(delivery.tenant, delivery.id))
    );
    return deliveries.filter(
      (delivery) =>
        isRenderableDelivery(delivery) &&
        ACTIVE_STATUSES.has(delivery.deliveryStatus) &&
        !completedKeys.has(getDeliveryKey(delivery.tenant, delivery.id))
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
