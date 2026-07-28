export type DashboardSalesDateType =
  | "placed_all"
  | "placed_open"
  | "placed_pending_invoice"
  | "placed_invoice_completed"
  | "closed_in_period"
  | "delivered_all"
  | "delivered_pending_invoice";

/** Legacy API values accepted for one release; normalized to DashboardSalesDateType. */
export const DASHBOARD_SALES_DATE_TYPE_LEGACY_ALIASES = {
  order: "placed_all",
  completed: "closed_in_period",
  delivery_completed: "delivered_all",
  pending_invoice_complete: "delivered_pending_invoice",
} as const satisfies Record<string, DashboardSalesDateType>;

export type DashboardSalesDateTypeLegacyAlias =
  keyof typeof DASHBOARD_SALES_DATE_TYPE_LEGACY_ALIASES;

export function normalizeDashboardSalesDateType(
  value: string | null | undefined,
): DashboardSalesDateType {
  if (!value) return "placed_all";
  if (value in DASHBOARD_SALES_DATE_TYPE_LEGACY_ALIASES) {
    return DASHBOARD_SALES_DATE_TYPE_LEGACY_ALIASES[
      value as DashboardSalesDateTypeLegacyAlias
    ];
  }
  return value as DashboardSalesDateType;
}

export function getDashboardSalesDateTypeLabel(dateType: DashboardSalesDateType) {
  switch (dateType) {
    case "placed_all":
      return "Placed – all";
    case "placed_open":
      return "Placed – not delivered";
    case "placed_pending_invoice":
      return "Placed – invoice pending";
    case "placed_invoice_completed":
      return "Placed – invoice completed";
    case "closed_in_period":
      return "Closed in period";
    case "delivered_all":
      return "Delivered in period – all";
    case "delivered_pending_invoice":
      return "Delivered in period – invoice pending";
  }
}

export function isPlacedDashboardSalesDateType(dateType: DashboardSalesDateType) {
  return (
    dateType === "placed_all" ||
    dateType === "placed_open" ||
    dateType === "placed_pending_invoice" ||
    dateType === "placed_invoice_completed"
  );
}

export type DashboardOverviewInitialState = {
  fromDate: string;
  toDate: string;
  dateType: DashboardSalesDateType;
  analysisType: "merchant" | "gateway";
  lastUpdatedAt: number;
  salesLocations: Array<{
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
};

function getColomboDateKey(date: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getDefaultDashboardOverviewRange(now = new Date()) {
  const today = getColomboDateKey(now);

  return {
    fromDate: today,
    toDate: today,
  };
}
