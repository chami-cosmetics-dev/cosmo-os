export type DashboardOverviewInitialState = {
  fromDate: string;
  toDate: string;
  dateType: "order" | "completed";
  analysisType: "merchant" | "gateway";
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
  }>;
};

export function getDefaultDashboardOverviewRange(now = new Date()) {
  const to = new Date(now);
  const from = new Date(now);

  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}
