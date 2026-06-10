import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/src/api/client";
import { useAuth } from "@/src/providers/auth";
import { getConfiguredTenants } from "@/src/tenants";
import type { TenantId } from "@/src/tenants/config";
import type { CashSummary } from "@/src/types";

export type TenantCashSummary = CashSummary & {
  tenant: TenantId;
  companyLabel: string;
};

export function useCashSummaries() {
  const { activeTenantIds } = useAuth();
  const [summaries, setSummaries] = useState<TenantCashSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const tenants = getConfiguredTenants().filter((tenant) => activeTenantIds.includes(tenant.id));
      const responses = await Promise.all(
        tenants.map(async (tenant) => {
          try {
            const data = await apiClient.get<CashSummary>(tenant.id, "/api/mobile/v1/cash-summary");
            return {
              ...data,
              tenant: tenant.id,
              companyLabel: tenant.label,
            };
          } catch {
            return null;
          }
        })
      );
      setSummaries(responses.filter((summary): summary is TenantCashSummary => summary !== null));
    } finally {
      setRefreshing(false);
    }
  }, [activeTenantIds]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const totalCollectedCash = summaries
    .reduce((sum, summary) => sum + Number(summary.totalCollectedCash || 0), 0)
    .toFixed(2);
  const totalExpectedCash = summaries
    .reduce((sum, summary) => sum + Number(summary.totalExpectedCash || 0), 0)
    .toFixed(2);

  return {
    summaries,
    totalCollectedCash,
    totalExpectedCash,
    refreshing,
    reload,
  };
}
