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
  paydayConfigured: boolean;
  paydayDayOfMonth: number | null;
  period: RiderPerformanceResponse["period"];
  completedCount: number | null;
  failedCount: number | null;
  incentiveTotal: string | null;
  todayCompletedCount: number;
  todayIncentiveTotal: string;
  lines: RiderPerformanceLine[];
  tenantErrors: TenantId[];
};

function emptyAggregate(): AggregatedRiderPerformance {
  return {
    paydayConfigured: false,
    paydayDayOfMonth: null,
    period: null,
    completedCount: null,
    failedCount: null,
    incentiveTotal: null,
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
        okPayloads.find((row) => row.tenant.id === "cosmetics" && row.payload?.paydayConfigured)?.payload ??
        okPayloads.find((row) => row.payload?.paydayConfigured)?.payload ??
        okPayloads[0]!.payload!;

      let completedCount = 0;
      let failedCount = 0;
      let incentiveTotal = 0;
      let todayCompletedCount = 0;
      let todayIncentiveTotal = 0;
      const lines: RiderPerformanceLine[] = [];
      let anyConfigured = false;

      for (const row of okPayloads) {
        const payload = row.payload!;
        if (payload.paydayConfigured) {
          anyConfigured = true;
          completedCount += payload.completedCount ?? 0;
          failedCount += payload.failedCount ?? 0;
          incentiveTotal += parseMoney(payload.incentiveTotal);
          for (const line of payload.lines) {
            lines.push({
              ...line,
              tenant: row.tenant.id,
              companyLabel: row.tenant.label,
            });
          }
        }
        todayCompletedCount += payload.todayCompletedCount ?? 0;
        todayIncentiveTotal += parseMoney(payload.todayIncentiveTotal);
      }

      lines.sort((a, b) => String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")));

      setData({
        paydayConfigured: anyConfigured,
        paydayDayOfMonth: preferred.paydayDayOfMonth,
        period: preferred.period,
        completedCount: anyConfigured ? completedCount : null,
        failedCount: anyConfigured ? failedCount : null,
        incentiveTotal: anyConfigured ? incentiveTotal.toFixed(2) : null,
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
