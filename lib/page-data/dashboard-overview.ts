import {
  fetchDashboardSalesByLocationMerchant,
} from "@/lib/page-data/dashboard-sales";
import {
  getDefaultDashboardOverviewRange,
  type DashboardOverviewInitialState,
  type DashboardSalesDateType,
} from "@/lib/page-data/dashboard-overview-shared";

export async function getDefaultDashboardOverviewInitialState(
  companyId: string,
  dateType: DashboardSalesDateType = "placed_all",
): Promise<DashboardOverviewInitialState> {
  const range = getDefaultDashboardOverviewRange();
  const result = await fetchDashboardSalesByLocationMerchant(companyId, {
    fromYmd: range.fromDate,
    toYmd: range.toDate,
    dateType,
  });

  return {
    ...range,
    dateType,
    analysisType: "merchant",
    lastUpdatedAt: Date.now(),
    salesLocations: result.locations,
  };
}
