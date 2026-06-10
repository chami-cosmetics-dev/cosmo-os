import { useCallback, useEffect, useState } from "react";

import { apiClient } from "@/src/api/client";
import { useAuth } from "@/src/providers/auth";
import { getConfiguredTenants } from "@/src/tenants";
import type { CashHandoverRecord, CashHandoversResponse } from "@/src/types";

export function useHandoverHistory() {
  const { activeTenantIds } = useAuth();
  const [handovers, setHandovers] = useState<CashHandoverRecord[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const tenants = getConfiguredTenants().filter((tenant) => activeTenantIds.includes(tenant.id));
      const responses = await Promise.all(
        tenants.map(async (tenant) => {
          try {
            const data = await apiClient.get<CashHandoversResponse>(tenant.id, "/api/mobile/v1/handovers");
            return data.handovers.map((handover) => ({
              ...handover,
              tenant: tenant.id,
              companyLabel: tenant.label,
            }));
          } catch {
            return [];
          }
        })
      );
      setHandovers(
        responses
          .flat()
          .sort((a, b) => new Date(b.handoverDate).getTime() - new Date(a.handoverDate).getTime())
      );
    } finally {
      setRefreshing(false);
    }
  }, [activeTenantIds]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { handovers, refreshing, reload };
}
