import { useCallback, useState } from "react";
import { apiClient } from "@/src/api/client";
import { useRefreshOnFocus } from "@/src/hooks/use-refresh-on-focus";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import type { MobileDeliveriesResponse } from "@/src/types";
import { isRenderableDelivery } from "@/src/utils/delivery";

export type CompletedListItem = {
  id: string;
  orderLabel: string;
  amount: string;
  completedAt?: string | null;
  customerName: string | null;
  companyLocation?: { name: string } | null;
};

export function useCompletedDeliveriesList() {
  const { completedDeliveries } = useCompletedDeliveries();
  const [deliveries, setDeliveries] = useState<CompletedListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiClient.get<MobileDeliveriesResponse>("/api/mobile/v1/deliveries");
      const remoteCompleted = data.deliveries.filter((delivery) => delivery.deliveryStatus === "completed");
      const merged: CompletedListItem[] = [...completedDeliveries, ...remoteCompleted]
        .filter(isRenderableDelivery)
        .filter((delivery, index, all) => all.findIndex((item) => item.id === delivery.id) === index)
        .map((delivery) => ({
          id: delivery.id,
          orderLabel: delivery.orderLabel,
          amount: delivery.amount,
          completedAt: "completedAt" in delivery && delivery.completedAt ? delivery.completedAt : null,
          customerName: delivery.customerName,
          companyLocation: delivery.companyLocation ?? null,
        }));
      setDeliveries(merged);
    } finally {
      setRefreshing(false);
    }
  }, [completedDeliveries]);

  useRefreshOnFocus(reload, [completedDeliveries]);

  return {
    deliveries,
    refreshing,
    reload,
  };
}
