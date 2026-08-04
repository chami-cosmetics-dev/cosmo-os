import {
  fetchDashboardFilterSummaries,
  fetchDashboardSalesByLocationMerchant,
} from "@/lib/page-data/dashboard-sales";
import {
  getDefaultDashboardOverviewRange,
  type DashboardOverviewInitialState,
  type DashboardSalesDateType,
} from "@/lib/page-data/dashboard-overview-shared";

export async function getDefaultDashboardOverviewInitialState(
  companyId: string,
  dateType: DashboardSalesDateType = "all_orders",
): Promise<DashboardOverviewInitialState> {
  const range = getDefaultDashboardOverviewRange();
  const [result, summaries] = await Promise.all([
    fetchDashboardSalesByLocationMerchant(companyId, {
      fromYmd: range.fromDate,
      toYmd: range.toDate,
      dateType,
    }),
    fetchDashboardFilterSummaries(companyId, range.fromDate, range.toDate),
  ]);

  return {
    ...range,
    dateType,
    analysisType: "merchant",
    lastUpdatedAt: Date.now(),
    filterSummaries: summaries.invalidRange ? [] : summaries.filterSummaries,
    salesLocations: result.locations,
  };
}
