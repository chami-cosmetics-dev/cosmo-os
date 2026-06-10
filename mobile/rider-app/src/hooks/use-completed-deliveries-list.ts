import { useCallback, useState } from "react";
import { apiClient } from "@/src/api/client";
import { useRefreshOnFocus } from "@/src/hooks/use-refresh-on-focus";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { useAuth } from "@/src/providers/auth";
import { getConfiguredTenants } from "@/src/tenants";
import { getDeliveryKey, getTenantDefinition } from "@/src/tenants/config";
import type { MobileDeliveriesResponse, PaymentMethod, TenantMobileDelivery } from "@/src/types";
import { isRenderableDelivery } from "@/src/utils/delivery";

export type CompletedListItem = {
  tenant: TenantMobileDelivery["tenant"];
  id: string;
  orderLabel: string;
  amount: string;
  currency?: string | null;
  completedAt?: string | null;
  customerName: string | null;
  expectedPaymentMethod?: PaymentMethod | null;
  shippingAddress?: unknown;
  billingAddress?: unknown;
  companyLocation?: { name: string } | null;
  companyLabel: string;
};

export function useCompletedDeliveriesList() {
  const { activeTenantIds } = useAuth();
  const { completedDeliveries } = useCompletedDeliveries();
  const [deliveries, setDeliveries] = useState<CompletedListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const tenants = getConfiguredTenants().filter((tenant) => activeTenantIds.includes(tenant.id));
      const remoteResponses = await Promise.all(
        tenants.map(async (tenant) => {
          try {
            const data = await apiClient.get<MobileDeliveriesResponse>(tenant.id, "/api/mobile/v1/deliveries");
            return data.deliveries
              .filter((delivery) => delivery.deliveryStatus === "completed")
              .map((delivery) => ({
                tenant: tenant.id,
                id: delivery.id,
                orderLabel: delivery.orderLabel,
                amount: delivery.amount,
                currency: delivery.currency,
                completedAt: delivery.completedAt ?? null,
                customerName: delivery.customerName,
                expectedPaymentMethod: delivery.expectedPaymentMethod,
                shippingAddress: delivery.shippingAddress,
                billingAddress: delivery.billingAddress,
                companyLocation: delivery.companyLocation ?? null,
                companyLabel: tenant.label,
              }));
          } catch {
            return [];
          }
        })
      );

      const merged: CompletedListItem[] = [
        ...completedDeliveries.map((delivery) => ({
          tenant: delivery.tenant,
          id: delivery.id,
          orderLabel: delivery.orderLabel,
          amount: delivery.amount,
          currency: null,
          completedAt: delivery.completedAt,
          customerName: delivery.customerName,
          expectedPaymentMethod: null,
          shippingAddress: undefined,
          billingAddress: undefined,
          companyLocation: delivery.companyLocation ?? null,
          companyLabel: delivery.companyLabel ?? getTenantDefinition(delivery.tenant).label,
        })),
        ...remoteResponses.flat(),
      ]
        .filter(isRenderableDelivery)
        .filter(
          (delivery, index, all) =>
            all.findIndex((item) => getDeliveryKey(item.tenant, item.id) === getDeliveryKey(delivery.tenant, delivery.id)) ===
            index
        );

      setDeliveries(merged);
    } finally {
      setRefreshing(false);
    }
  }, [activeTenantIds, completedDeliveries]);

  useRefreshOnFocus(reload, [activeTenantIds, completedDeliveries]);

  return {
    deliveries,
    refreshing,
    reload,
  };
}
