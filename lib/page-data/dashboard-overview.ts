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
    dateType: "order",
  });

  return {
    ...range,
    dateType: "order",
    analysisType: "merchant",
    salesLocations: result.locations,
  };
}
