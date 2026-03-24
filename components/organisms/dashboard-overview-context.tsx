"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createClientPerfLogger } from "@/lib/client-perf";

export type DashboardSalesLocation = {
  id: string;
  name: string;
  merchants: Array<{ merchantName: string; total: number; orderCount: number }>;
};

type DashboardOverviewContextValue = {
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  dateType: "order" | "completed";
  setDateType: (v: "order" | "completed") => void;
  analysisType: "merchant" | "gateway";
  setAnalysisType: (v: "merchant" | "gateway") => void;
  initialRange: { fromDate: string; toDate: string };
  salesLocations: DashboardSalesLocation[];
  salesLoading: boolean;
  salesError: string | null;
  filterInfo: string;
  hasInvalidRange: boolean;
};

const DashboardOverviewContext = createContext<DashboardOverviewContextValue | null>(null);

function getDefaultDateRange() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 7);
  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}

export function DashboardOverviewProvider({ children }: { children: ReactNode }) {
  const pagePerfRef = useRef(createClientPerfLogger("dashboard.overview.mount"));
  const fetchIdRef = useRef(0);
  const initialRange = useMemo(() => getDefaultDateRange(), []);

  const [fromDate, setFromDate] = useState(initialRange.fromDate);
  const [toDate, setToDate] = useState(initialRange.toDate);
  const [dateType, setDateType] = useState<"order" | "completed">("order");
  const [analysisType, setAnalysisType] = useState<"merchant" | "gateway">("merchant");

  const [salesLocations, setSalesLocations] = useState<DashboardSalesLocation[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  const hasInvalidRange = new Date(fromDate) > new Date(toDate);

  const filterInfo = useMemo(() => {
    const from = new Date(`${fromDate}T12:00:00`);
    const to = new Date(`${toDate}T12:00:00`);
    const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
    const range = `${fmt.format(from)} – ${fmt.format(to)}`;
    const dateSource =
      dateType === "order" ? "Invoice date" : "Invoice completed at";
    return `${range} · ${dateSource}`;
  }, [fromDate, toDate, dateType]);

  const loadSales = useCallback(async () => {
    const perf = createClientPerfLogger("dashboard.overview.fetch", {
      analysisType,
      dateType,
      fromDate,
      toDate,
    });
    if (hasInvalidRange) {
      fetchIdRef.current += 1;
      setSalesLocations([]);
      setSalesError(null);
      setSalesLoading(false);
      perf.end({ skipped: "invalid-range" });
      return;
    }
    const id = ++fetchIdRef.current;
    setSalesLoading(true);
    setSalesError(null);
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        date_type: dateType,
        analysis_type: analysisType,
      });
      const res = await fetch(`/api/admin/dashboard/sales-by-location?${params.toString()}`);
      perf.mark("response");
      const body = (await res.json()) as {
        error?: string;
        locations?: Array<{
          id: string;
          name: string;
          merchants: Array<{
            merchantName: string;
            total: number;
            orderCount: number;
          }>;
        }>;
      };
      if (id !== fetchIdRef.current) return;
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load dashboard sales");
      }
      setSalesLocations(
        (body.locations ?? []).map((loc) => ({
          id: loc.id,
          name: loc.name,
          merchants: loc.merchants.map((m) => ({
            merchantName: m.merchantName,
            total: m.total,
            orderCount: m.orderCount,
          })),
        })),
      );
      perf.end({ ok: true, locationCount: body.locations?.length ?? 0 });
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      setSalesError(e instanceof Error ? e.message : "Failed to load dashboard sales");
      setSalesLocations([]);
      perf.end({ ok: false, error: e instanceof Error ? e.message : "unknown" });
    } finally {
      if (id === fetchIdRef.current) setSalesLoading(false);
    }
  }, [analysisType, dateType, fromDate, hasInvalidRange, toDate]);

  useEffect(() => {
    void loadSales();
  }, [loadSales]);

  useEffect(() => {
    pagePerfRef.current.end({ hasInitialData: false });
  }, []);

  const value = useMemo<DashboardOverviewContextValue>(
    () => ({
      fromDate,
      setFromDate,
      toDate,
      setToDate,
      dateType,
      setDateType,
      analysisType,
      setAnalysisType,
      initialRange,
      salesLocations,
      salesLoading,
      salesError,
      filterInfo,
      hasInvalidRange,
    }),
    [
      analysisType,
      dateType,
      filterInfo,
      fromDate,
      hasInvalidRange,
      initialRange,
      salesError,
      salesLoading,
      salesLocations,
      toDate,
    ],
  );

  return (
    <DashboardOverviewContext.Provider value={value}>
      {children}
    </DashboardOverviewContext.Provider>
  );
}

export function useDashboardOverview() {
  const ctx = useContext(DashboardOverviewContext);
  if (!ctx) {
    throw new Error("useDashboardOverview must be used within DashboardOverviewProvider");
  }
  return ctx;
}
