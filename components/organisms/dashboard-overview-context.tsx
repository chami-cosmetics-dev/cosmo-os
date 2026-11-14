"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import {
  appendDashboardCouponQuery,
  formatDashboardCouponFilterLabel,
} from "@/lib/dashboard-coupon-filter";
import {
  getDefaultDashboardOverviewRange,
  getDashboardSalesDateTypeLabel,
  type DashboardFilterSummary,
  type DashboardSalesDateType,
  type DashboardOverviewInitialState,
} from "@/lib/page-data/dashboard-overview-shared";

const DASHBOARD_LOCALE = "en-LK";
const DASHBOARD_TIME_ZONE = "Asia/Colombo";

export type DashboardSalesLocation = {
  id: string;
  name: string;
  defaultMerchantId: string | null;
  defaultMerchantName: string | null;
  merchants: Array<{
    merchantId: string | null;
    merchantName: string;
    total: number;
    orderCount: number;
  }>;
  sources: Array<{
    sourceName: string;
    total: number;
    orderCount: number;
  }>;
};

type DashboardOverviewContextValue = {
  fromDate: string;
  setFromDate: (v: string) => void;
  toDate: string;
  setToDate: (v: string) => void;
  dateType: DashboardSalesDateType;
  setDateType: (v: DashboardSalesDateType) => void;
  analysisType: "merchant" | "gateway";
  setAnalysisType: (v: "merchant" | "gateway") => void;
  selectedCouponCodes: string[];
  setSelectedCouponCodes: Dispatch<SetStateAction<string[]>>;
  couponCodes: string[];
  initialRange: { fromDate: string; toDate: string };
  salesLocations: DashboardSalesLocation[];
  salesLoading: boolean;
  salesError: string | null;
  filterInfo: string;
  hasInvalidRange: boolean;
  refreshSales: () => Promise<void>;
  lastUpdatedAt: number | null;
  filterSummaries: DashboardFilterSummary[];
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
  const [dateType, setDateType] = useState<DashboardSalesDateType>(
    initialState?.dateType ?? "all_orders",
  );
  const [analysisType, setAnalysisType] = useState<"merchant" | "gateway">(
    initialState?.analysisType ?? "merchant",
  );
  const [selectedCouponCodes, setSelectedCouponCodes] = useState<string[]>([]);
  const [couponCodes, setCouponCodes] = useState<string[]>(initialState?.couponCodes ?? []);

  const [salesLocations, setSalesLocations] = useState<DashboardSalesLocation[]>(
    initialState?.salesLocations ?? [],
  );
  const [filterSummaries, setFilterSummaries] = useState<DashboardFilterSummary[]>(
    initialState?.filterSummaries ?? [],
  );
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(
    initialState?.lastUpdatedAt ?? null,
  );

  const fetchIdRef = useRef(0);
  const shouldSkipInitialFetchRef = useRef(initialState !== null && initialState !== undefined);

  const hasInvalidRange = new Date(fromDate) > new Date(toDate);

  const filterInfo = useMemo(() => {
    const from = new Date(`${fromDate}T12:00:00`);
    const to = new Date(`${toDate}T12:00:00`);
    const fmt = new Intl.DateTimeFormat(DASHBOARD_LOCALE, {
      dateStyle: "medium",
      timeZone: DASHBOARD_TIME_ZONE,
    });
    const range = `${fmt.format(from)} – ${fmt.format(to)}`;
    const dateSource = getDashboardSalesDateTypeLabel(dateType);
    const couponPart =
      selectedCouponCodes.length > 0
        ? ` · ${formatDashboardCouponFilterLabel(selectedCouponCodes)}`
        : "";
    return `${range} · ${dateSource}${couponPart}`;
  }, [fromDate, toDate, dateType, selectedCouponCodes]);

  const loadSales = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (hasInvalidRange) {
      fetchIdRef.current += 1;
      setSalesLocations([]);
      setFilterSummaries([]);
      setSalesError(null);
      if (!silent) setSalesLoading(false);
      return;
    }
    const id = ++fetchIdRef.current;
    if (!silent) {
      setSalesLoading(true);
      setSalesError(null);
    }
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        date_type: dateType,
        analysis_type: analysisType,
        include_summaries: "true",
      });
      appendDashboardCouponQuery(params, selectedCouponCodes);
      const res = await fetch(`/api/admin/dashboard/sales-by-location?${params.toString()}`);
      const body = (await res.json()) as {
        error?: string;
        locations?: Array<{
          id: string;
          name: string;
          defaultMerchantId: string | null;
          defaultMerchantName: string | null;
          merchants: Array<{
            merchantId: string | null;
            merchantName: string;
            total: number;
            orderCount: number;
          }>;
          sources: Array<{
            sourceName: string;
            total: number;
            orderCount: number;
          }>;
        }>;
        filterSummaries?: DashboardFilterSummary[];
        couponCodes?: string[];
      };
      if (id !== fetchIdRef.current) return;
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to load dashboard sales");
      }
      setSalesLocations(
        (body.locations ?? []).map((loc) => ({
          id: loc.id,
          name: loc.name,
          defaultMerchantId: loc.defaultMerchantId,
          defaultMerchantName: loc.defaultMerchantName,
          merchants: loc.merchants.map((m) => ({
            merchantId: m.merchantId,
            merchantName: m.merchantName,
            total: m.total,
            orderCount: m.orderCount,
          })),
          sources: loc.sources.map((source) => ({
            sourceName: source.sourceName,
            total: source.total,
            orderCount: source.orderCount,
          })),
        })),
      );
      if (body.filterSummaries) {
        setFilterSummaries(body.filterSummaries);
      }
      if (body.couponCodes) {
        setCouponCodes(body.couponCodes);
      }
      setLastUpdatedAt(Date.now());
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      if (!silent) {
        setSalesError(e instanceof Error ? e.message : "Failed to load dashboard sales");
        setSalesLocations([]);
      }
    } finally {
      if (id === fetchIdRef.current && !silent) setSalesLoading(false);
    }
  }, [analysisType, dateType, fromDate, hasInvalidRange, selectedCouponCodes, toDate]);

  useEffect(() => {
    if (shouldSkipInitialFetchRef.current) {
      shouldSkipInitialFetchRef.current = false;
      return;
    }
    void loadSales();
  }, [loadSales]);

  useEffect(() => {
    if (selectedCouponCodes.length === 0) return;
    const available = new Set(couponCodes.map((code) => code.trim().toUpperCase()));
    const next = selectedCouponCodes.filter((code) => available.has(code.trim().toUpperCase()));
    if (next.length !== selectedCouponCodes.length) setSelectedCouponCodes(next);
  }, [couponCodes, selectedCouponCodes]);

  useEffect(() => {
    if (hasInvalidRange) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadSales({ silent: true });
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [hasInvalidRange, loadSales]);

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
      selectedCouponCodes,
      setSelectedCouponCodes,
      couponCodes,
      initialRange,
      salesLocations,
      salesLoading,
      salesError,
      filterInfo,
      hasInvalidRange,
      refreshSales: loadSales,
      lastUpdatedAt,
      filterSummaries,
    }),
    [
      analysisType,
      couponCodes,
      selectedCouponCodes,
      dateType,
      filterInfo,
      filterSummaries,
      fromDate,
      hasInvalidRange,
      initialRange,
      lastUpdatedAt,
      loadSales,
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
