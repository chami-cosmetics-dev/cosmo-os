export type DashboardSalesDateType = "order" | "completed" | "delivery_completed";

export function getDashboardSalesDateTypeLabel(dateType: DashboardSalesDateType) {
  if (dateType === "order") return "Invoice date";
  if (dateType === "completed") return "Invoice completed at";
  return "Delivery Completed at";
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
