import { useCallback, useEffect, useState } from "react";
import { apiClient } from "@/src/api/client";
import type { CashSummary } from "@/src/types";

export function useCashSummary() {
  const [summary, setSummary] = useState<CashSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiClient.get<CashSummary>("/api/mobile/v1/cash-summary");
      setSummary(data);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    summary,
    refreshing,
    reload,
  };
}
