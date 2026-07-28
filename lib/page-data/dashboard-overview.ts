import {
  fetchDashboardSalesByLocationMerchant,
} from "@/lib/page-data/dashboard-sales";
import {
  getDefaultDashboardOverviewRange,
  type DashboardOverviewInitialState,
} from "@/lib/page-data/dashboard-overview-shared";

export async function getDefaultDashboardOverviewInitialState(
  companyId: string,
): Promise<DashboardOverviewInitialState> {
  const range = getDefaultDashboardOverviewRange();
  const result = await fetchDashboardSalesByLocationMerchant(companyId, {
    fromYmd: range.fromDate,
    toYmd: range.toDate,
    dateType: "placed_all",
  });

  return {
    ...range,
    dateType: "placed_all",
    analysisType: "merchant",
    lastUpdatedAt: Date.now(),
    salesLocations: result.locations,
  };
}
