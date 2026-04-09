export type DashboardOverviewInitialState = {
  fromDate: string;
  toDate: string;
  dateType: "order" | "completed";
  analysisType: "merchant" | "gateway";
  salesLocations: Array<{
    id: string;
    name: string;
    merchants: Array<{
      merchantName: string;
      total: number;
      orderCount: number;
    }>;
  }>;
};

export function getDefaultDashboardOverviewRange(now = new Date()) {
  const to = new Date(now);
  const from = new Date(now);
  from.setDate(from.getDate() - 7);

  return {
    fromDate: from.toISOString().slice(0, 10),
    toDate: to.toISOString().slice(0, 10),
  };
}
