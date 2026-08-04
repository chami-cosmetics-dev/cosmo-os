export type DashboardSalesDateType =
  | "all_orders"
  | "not_delivered"
  | "bill_done_early"
  | "bill_open"
  | "done_after_delivery"
  | "bill_done_in_dates"
  | "delivered_in_dates"
  | "bill_done_old"
  | "delivered_old"
  | "still_bill_open"
  | "still_not_delivered";

export type DashboardSalesFilterGroup = "status" | "event" | "backlog";

export type DashboardFilterSummary = {
  key: DashboardSalesDateType;
  group: DashboardSalesFilterGroup;
  label: string;
  total: number;
  orderCount: number;
  addsToAllOrders: boolean;
};

/** Legacy API values accepted for one release; normalized to DashboardSalesDateType. */
export const DASHBOARD_SALES_DATE_TYPE_LEGACY_ALIASES = {
  order: "all_orders",
  placed_all: "all_orders",
  placed_open: "not_delivered",
  placed_pending_invoice: "bill_open",
  placed_invoice_completed: "done_after_delivery",
  completed: "bill_done_old",
  closed_in_period: "bill_done_old",
  delivery_completed: "delivered_in_dates",
  delivered_all: "delivered_in_dates",
  pending_invoice_complete: "still_bill_open",
  delivered_pending_invoice: "still_bill_open",
} as const satisfies Record<string, DashboardSalesDateType>;

export type DashboardSalesDateTypeLegacyAlias =
  keyof typeof DASHBOARD_SALES_DATE_TYPE_LEGACY_ALIASES;

export const DASHBOARD_SALES_STATUS_PARTITION_KEYS = [
  "not_delivered",
  "bill_done_early",
  "bill_open",
  "done_after_delivery",
] as const satisfies readonly DashboardSalesDateType[];

export function normalizeDashboardSalesDateType(
  value: string | null | undefined,
): DashboardSalesDateType {
  if (!value) return "all_orders";
  if (value in DASHBOARD_SALES_DATE_TYPE_LEGACY_ALIASES) {
    return DASHBOARD_SALES_DATE_TYPE_LEGACY_ALIASES[
      value as DashboardSalesDateTypeLegacyAlias
    ];
  }
  return value as DashboardSalesDateType;
}

export function getDashboardSalesDateTypeLabel(dateType: DashboardSalesDateType) {
  switch (dateType) {
    case "all_orders":
      return "All orders";
    case "not_delivered":
      return "Not delivered";
    case "bill_done_early":
      return "Bill done early";
    case "bill_open":
      return "Bill open";
    case "done_after_delivery":
      return "Done after delivery";
    case "bill_done_in_dates":
      return "Bill done in dates";
    case "delivered_in_dates":
      return "Delivered in dates";
    case "bill_done_old":
      return "Bill done (old orders)";
    case "delivered_old":
      return "Delivered (old orders)";
    case "still_bill_open":
      return "Still bill open";
    case "still_not_delivered":
      return "Still not delivered";
  }
}

export function getDashboardSalesFilterGroup(
  dateType: DashboardSalesDateType,
): DashboardSalesFilterGroup {
  switch (dateType) {
    case "all_orders":
    case "not_delivered":
    case "bill_done_early":
    case "bill_open":
    case "done_after_delivery":
      return "status";
    case "still_bill_open":
    case "still_not_delivered":
      return "backlog";
    default:
      return "event";
  }
}

export function filterAddsToAllOrders(dateType: DashboardSalesDateType) {
  return (
    dateType === "all_orders" ||
    (DASHBOARD_SALES_STATUS_PARTITION_KEYS as readonly string[]).includes(dateType)
  );
}

export function isStatusDashboardSalesDateType(dateType: DashboardSalesDateType) {
  return getDashboardSalesFilterGroup(dateType) === "status";
}

/** @deprecated Use isStatusDashboardSalesDateType */
export function isPlacedDashboardSalesDateType(dateType: DashboardSalesDateType) {
  return isStatusDashboardSalesDateType(dateType);
}

export type DashboardOverviewInitialState = {
  fromDate: string;
  toDate: string;
  dateType: DashboardSalesDateType;
  analysisType: "merchant" | "gateway";
  lastUpdatedAt: number;
  filterSummaries?: DashboardFilterSummary[];
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
