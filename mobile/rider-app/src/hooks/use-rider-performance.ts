import { useCallback, useEffect, useMemo, useState } from "react";

import { apiClient } from "@/src/api/client";
import { useAuth } from "@/src/providers/auth";
import { getConfiguredTenants } from "@/src/tenants";
import type { TenantId } from "@/src/tenants/config";
import type {
  RiderPerformanceLine,
  RiderPerformancePeriodKind,
  RiderPerformanceResponse,
} from "@/src/types/performance";
import { parseMoney } from "@/src/utils/money";

export type AggregatedRiderPerformance = {
  period: RiderPerformanceResponse["period"];
  completedCount: number;
  failedCount: number;
  incentiveTotal: string;
  todayCompletedCount: number;
  todayIncentiveTotal: string;
  lines: RiderPerformanceLine[];
  tenantErrors: TenantId[];
};

function emptyAggregate(): AggregatedRiderPerformance {
  return {
    period: null,
    completedCount: 0,
    failedCount: 0,
    incentiveTotal: "0.00",
    todayCompletedCount: 0,
    todayIncentiveTotal: "0.00",
    lines: [],
    tenantErrors: [],
  };
}

export function useRiderPerformance(period: RiderPerformancePeriodKind = "current") {
  const { activeTenantIds } = useAuth();
  const [data, setData] = useState<AggregatedRiderPerformance>(emptyAggregate);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const tenants = getConfiguredTenants().filter((tenant) => activeTenantIds.includes(tenant.id));
      const responses = await Promise.all(
        tenants.map(async (tenant) => {
          try {
            const payload = await apiClient.get<RiderPerformanceResponse>(
              tenant.id,
              `/api/mobile/v1/me/performance?period=${period}`
            );
            return { tenant, payload, ok: true as const };
          } catch {
            return { tenant, payload: null, ok: false as const };
          }
        })
      );

      const okPayloads = responses.filter((row) => row.ok && row.payload);
      const tenantErrors = responses.filter((row) => !row.ok).map((row) => row.tenant.id);

      if (okPayloads.length === 0) {
        setData({ ...emptyAggregate(), tenantErrors });
        return;
      }

      const preferred =
        okPayloads.find((row) => row.tenant.id === "cosmetics")?.payload ?? okPayloads[0]!.payload!;

      let completedCount = 0;
      let failedCount = 0;
      let incentiveTotal = 0;
      let todayCompletedCount = 0;
      let todayIncentiveTotal = 0;
      const lines: RiderPerformanceLine[] = [];

      for (const row of okPayloads) {
        const payload = row.payload!;
        completedCount += payload.completedCount ?? 0;
        failedCount += payload.failedCount ?? 0;
        incentiveTotal += parseMoney(payload.incentiveTotal);
        todayCompletedCount += payload.todayCompletedCount ?? 0;
        todayIncentiveTotal += parseMoney(payload.todayIncentiveTotal);
        for (const line of payload.lines) {
          lines.push({
            ...line,
            tenant: row.tenant.id,
            companyLabel: row.tenant.label,
          });
        }
      }

      lines.sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")));

      setData({
        period: preferred.period,
        completedCount,
        failedCount,
        incentiveTotal: incentiveTotal.toFixed(2),
        todayCompletedCount,
        todayIncentiveTotal: todayIncentiveTotal.toFixed(2),
        lines,
        tenantErrors,
      });
    } finally {
      setRefreshing(false);
    }
  }, [activeTenantIds, period]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const periodLabel = useMemo(() => {
    if (!data.period) return null;
    const from = new Date(data.period.from).toLocaleDateString("en-LK");
    const to = new Date(data.period.to).toLocaleDateString("en-LK");
    return `${from} – ${to}`;
  }, [data.period]);

  return {
    data,
    periodLabel,
    refreshing,
    reload,
  };
}
