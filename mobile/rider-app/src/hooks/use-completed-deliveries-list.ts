import { useCallback, useState } from "react";
import { apiClient } from "@/src/api/client";
import { useRefreshOnFocus } from "@/src/hooks/use-refresh-on-focus";
import { useCompletedDeliveries } from "@/src/providers/completed-deliveries";
import { useAuth } from "@/src/providers/auth";
import { getConfiguredTenants } from "@/src/tenants";
import { getDeliveryKey, getTenantDefinition } from "@/src/tenants/config";
import type { MobileDeliveriesResponse, PaymentMethod, TenantMobileDelivery } from "@/src/types";
import { getCompletedDateKey, getTodayDateKey } from "@/src/utils/completed-dates";
import { isRenderableDelivery } from "@/src/utils/delivery";

const PAGE_SIZE = 40;

export type CompletedListItem = {
  tenant: TenantMobileDelivery["tenant"];
  id: string;
  orderLabel: string;
  amount: string;
  currency?: string | null;
  completedAt?: string | null;
  customerName: string | null;
  expectedPaymentMethod?: PaymentMethod | null;
  incentiveAmount?: string | null;
  shippingAddress?: unknown;
  billingAddress?: unknown;
  companyLocation?: { name: string } | null;
  companyLabel: string;
};

function mapRemoteDelivery(
  tenantId: CompletedListItem["tenant"],
  companyLabel: string,
  delivery: MobileDeliveriesResponse["deliveries"][number]
): CompletedListItem {
  return {
    tenant: tenantId,
    id: delivery.id,
    orderLabel: delivery.orderLabel,
    amount: delivery.amount,
    currency: delivery.currency,
    completedAt: delivery.completedAt ?? null,
    customerName: delivery.customerName,
    expectedPaymentMethod: delivery.expectedPaymentMethod,
    incentiveAmount: delivery.incentiveAmount ?? null,
    shippingAddress: delivery.shippingAddress,
    billingAddress: delivery.billingAddress,
    companyLocation: delivery.companyLocation ?? null,
    companyLabel,
  };
}

function dedupeCompleted(items: CompletedListItem[]) {
  return items.filter(
    (delivery, index, all) =>
      all.findIndex((item) => getDeliveryKey(item.tenant, item.id) === getDeliveryKey(delivery.tenant, delivery.id)) ===
      index
  );
}

export function useCompletedDeliveriesList(selectedDate: string | null = null) {
  const { activeTenantIds } = useAuth();
  const { completedDeliveries } = useCompletedDeliveries();
  const [deliveries, setDeliveries] = useState<CompletedListItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const dayKey = selectedDate ?? getTodayDateKey();

  const mergeOfflineForDay = useCallback(
    (remote: CompletedListItem[], onDay: string) => {
      const offline: CompletedListItem[] = completedDeliveries
        .filter((delivery) => getCompletedDateKey(delivery.completedAt) === onDay)
        .map((delivery) => ({
          tenant: delivery.tenant,
          id: delivery.id,
          orderLabel: delivery.orderLabel,
          amount: delivery.amount,
          currency: null,
          completedAt: delivery.completedAt,
          customerName: delivery.customerName,
          expectedPaymentMethod: null,
          incentiveAmount: null,
          shippingAddress: undefined,
          billingAddress: undefined,
          companyLocation: delivery.companyLocation ?? null,
          companyLabel: delivery.companyLabel ?? getTenantDefinition(delivery.tenant).label,
        }));

      return dedupeCompleted([...offline, ...remote].filter(isRenderableDelivery));
    },
    [completedDeliveries]
  );

  const fetchPage = useCallback(
    async (pageOffset: number, onDate: string) => {
      const tenants = getConfiguredTenants().filter((tenant) => activeTenantIds.includes(tenant.id));
      const params = new URLSearchParams({
        status: "completed",
        limit: String(PAGE_SIZE),
        offset: String(pageOffset),
        on: onDate,
      });

      const remoteResponses = await Promise.all(
        tenants.map(async (tenant) => {
          try {
            const data = await apiClient.get<MobileDeliveriesResponse>(
              tenant.id,
              `/api/mobile/v1/deliveries?${params.toString()}`
            );
            return {
              items: data.deliveries.map((delivery) => mapRemoteDelivery(tenant.id, tenant.label, delivery)),
              hasMore: Boolean(data.hasMore),
            };
          } catch {
            return { items: [] as CompletedListItem[], hasMore: false };
          }
        })
      );

      return {
        items: remoteResponses.flatMap((row) => row.items),
        hasMore: remoteResponses.some((row) => row.hasMore),
      };
    },
    [activeTenantIds]
  );

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const onDay = selectedDate ?? getTodayDateKey();
      const page = await fetchPage(0, onDay);
      setOffset(PAGE_SIZE);
      setHasMore(page.hasMore);
      setDeliveries(mergeOfflineForDay(page.items, onDay));
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage, mergeOfflineForDay, selectedDate]);

  const loadMore = useCallback(async () => {
    if (loadingMore || refreshing || !hasMore) return;
    setLoadingMore(true);
    try {
      const onDay = selectedDate ?? getTodayDateKey();
      const page = await fetchPage(offset, onDay);
      setOffset((prev) => prev + PAGE_SIZE);
      setHasMore(page.hasMore);
      setDeliveries((prev) => dedupeCompleted([...prev, ...page.items].filter(isRenderableDelivery)));
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingMore, offset, refreshing, selectedDate]);

  useRefreshOnFocus(reload, [activeTenantIds, completedDeliveries, selectedDate, dayKey]);

  return {
    deliveries,
    dayKey,
    refreshing,
    loadingMore,
    hasMore,
    reload,
    loadMore,
  };
}
