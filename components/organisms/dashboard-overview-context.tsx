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

import {
  getDefaultDashboardOverviewRange,
  type DashboardOverviewInitialState,
} from "@/lib/page-data/dashboard-overview-shared";

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

export function DashboardOverviewProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: DashboardOverviewInitialState | null;
}) {
  const initialRange = useMemo(
    () =>
      initialState
        ? { fromDate: initialState.fromDate, toDate: initialState.toDate }
        : getDefaultDashboardOverviewRange(),
    [initialState],
  );

  const [fromDate, setFromDate] = useState(initialRange.fromDate);
  const [toDate, setToDate] = useState(initialRange.toDate);
  const [dateType, setDateType] = useState<"order" | "completed">(
    initialState?.dateType ?? "order",
  );
  const [analysisType, setAnalysisType] = useState<"merchant" | "gateway">(
    initialState?.analysisType ?? "merchant",
  );

  const [salesLocations, setSalesLocations] = useState<DashboardSalesLocation[]>(
    initialState?.salesLocations ?? [],
  );
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  const fetchIdRef = useRef(0);
  const shouldSkipInitialFetchRef = useRef(initialState !== null && initialState !== undefined);

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
    if (hasInvalidRange) {
      fetchIdRef.current += 1;
      setSalesLocations([]);
      setSalesError(null);
      setSalesLoading(false);
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
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      setSalesError(e instanceof Error ? e.message : "Failed to load dashboard sales");
      setSalesLocations([]);
    } finally {
      if (id === fetchIdRef.current) setSalesLoading(false);
    }
  }, [analysisType, dateType, fromDate, hasInvalidRange, toDate]);

  useEffect(() => {
    if (shouldSkipInitialFetchRef.current) {
      shouldSkipInitialFetchRef.current = false;
      return;
    }
    void loadSales();
  }, [loadSales]);

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
