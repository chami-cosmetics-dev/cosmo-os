import { prisma } from "@/lib/prisma";
import { auth0 } from "@/lib/auth0";
import { CallCenterPerformanceChart } from "@/components/molecules/call-center-performance-chart";
import { DeliverySummaryChart } from "@/components/molecules/delivery-summary-chart";
import { SalesPerformanceAnalysisChart } from "@/components/molecules/sales-performance-analysis-chart";
import {
  type DashboardFilters,
  getDeliverySummaryData,
  getDummyCallCenterPerformanceData,
  getDummyMerchantCharts,
  getDummySalesPerformanceData,
  getMerchantBreakdownData,
  getShopBreakdownData,
} from "@/lib/dashboard-charts";
import { DashboardFiltersBar } from "@/components/molecules/dashboard-filters-bar";
import { MerchantChartCard } from "@/components/molecules/merchant-chart-card";
import { MerchantBreakdownChart } from "@/components/molecules/merchant-breakdown-chart";
import { RecentItemsList } from "@/components/organisms/recent-items-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{
    from?: string;
    to?: string;
    dateType?: string;
    analysisType?: string;
    preset?: string;
  }>;
};

function formatInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string | undefined, fallback: Date) {
  if (!value) return new Date(fallback);

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date(fallback) : parsed;
}

function normalizeDashboardFilters(
  params: Awaited<DashboardPageProps["searchParams"]>,
): DashboardFilters {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const preset = params.preset;

  let presetFrom: Date | null = null;
  let presetTo: Date | null = null;
  if (preset === "today") {
    presetFrom = new Date(todayStart);
    presetTo = new Date(todayStart);
  } else if (preset === "last_7_days") {
    presetFrom = new Date(todayStart);
    presetFrom.setDate(presetFrom.getDate() - 6);
    presetTo = new Date(todayStart);
  } else if (preset === "last_30_days") {
    presetFrom = new Date(todayStart);
    presetFrom.setDate(presetFrom.getDate() - 29);
    presetTo = new Date(todayStart);
  } else if (preset === "this_month") {
    presetFrom = new Date(today.getFullYear(), today.getMonth(), 1);
    presetTo = new Date(todayStart);
  }

  const rawFrom = presetFrom ?? parseDateInput(params.from, todayStart);
  const rawTo = presetTo ?? parseDateInput(params.to, todayStart);
  const from = rawFrom <= rawTo ? rawFrom : rawTo;
  const toBase = rawFrom <= rawTo ? rawTo : rawFrom;
  const to = new Date(toBase);
  to.setHours(23, 59, 59, 999);

  return {
    from,
    to,
    dateType: params.dateType === "completed" ? "completed" : "order",
    analysisType:
      params.analysisType === "payment_gateway" ? "payment_gateway" : "merchant",
  };
}

function formatRangeSummary(filters: DashboardFilters) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const from = dateFormatter.format(filters.from);
  const to = dateFormatter.format(filters.to);
  const dateLabel = filters.dateType === "completed" ? "completed-date" : "order-date";
  const analysisLabel =
    filters.analysisType === "payment_gateway" ? "payment source" : "merchant";

  return from === to
    ? `Showing ${analysisLabel} analysis for ${dateLabel} ${from}.`
    : `Showing ${analysisLabel} analysis for ${dateLabel} range ${from} to ${to}.`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const filters = normalizeDashboardFilters(params);
  const session = await auth0.getSession();
  const user = session?.user
    ? await prisma.user.findUnique({
        where: { auth0Id: session.user.sub! },
        select: { companyId: true },
      })
    : null;

  let items: Array<{ id: string; name: string; createdAt?: string }> = [];
  if (user?.companyId) {
    try {
      const productItems = await prisma.productItem.findMany({
        where: {
          companyId: user.companyId,
          updatedAt: {
            gte: filters.from,
            lte: filters.to,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          id: true,
          productTitle: true,
          variantTitle: true,
          updatedAt: true,
        },
      });
      items = productItems.map((item) => ({
        id: item.id,
        name: item.variantTitle
          ? `${item.productTitle} (${item.variantTitle})`
          : item.productTitle,
        createdAt: item.updatedAt.toISOString(),
      }));
    } catch {
      // Database may not be set up yet
    }
  }

  const merchantCharts = getDummyMerchantCharts();
  const merchantBreakdownData = user?.companyId
    ? await getMerchantBreakdownData(user.companyId, filters)
    : [];
  const shopBreakdownData = user?.companyId
    ? await getShopBreakdownData(user.companyId, filters)
    : [];
  const callCenterPerformanceData = getDummyCallCenterPerformanceData();
  const deliverySummaryData = user?.companyId
    ? await getDeliverySummaryData(user.companyId, filters)
    : [];
  const salesPerformanceData = getDummySalesPerformanceData();
  const standardMerchantCharts = merchantCharts.slice(0, -2);
  const summaryMerchantCharts = merchantCharts.slice(-2);
  const primaryMerchantCharts = standardMerchantCharts.slice(0, 4);
  const totalSales = standardMerchantCharts.reduce((sum, chart) => sum + chart.total, 0);
  const totalOrders = merchantBreakdownData.reduce(
    (sum, entry) => sum + entry.invoiceCount,
    0,
  );
  const topMerchant = merchantBreakdownData[0]?.merchant ?? "No data";
  const topLocation = standardMerchantCharts[0]?.location ?? "No data";
  const topGroupLabel =
    filters.analysisType === "payment_gateway" ? "Top Source" : "Top Merchant";
  const primarySectionTitle =
    filters.analysisType === "payment_gateway"
      ? "Payment Source Performance"
      : "Merchant Performance";
  const primarySectionDescription =
    filters.analysisType === "payment_gateway"
      ? "Compare sales contribution by location and leading payment source grouping."
      : "Compare sales contribution by location and top assigned merchant.";
  const hasDashboardData =
    primaryMerchantCharts.length > 0 ||
    summaryMerchantCharts.length > 0 ||
    merchantBreakdownData.length > 0 ||
    shopBreakdownData.length > 0 ||
    deliverySummaryData.length > 0;

  return (
    <div className="space-y-6">
      <DashboardFiltersBar
        fromDate={formatInputDate(filters.from)}
        toDate={formatInputDate(filters.to)}
        dateType={filters.dateType}
        analysisType={filters.analysisType}
        summary={formatRangeSummary(filters)}
      />

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard Overview</h2>
          <p className="text-sm text-muted-foreground">
            Review the most important sales signals first, then move into detailed
            operational analysis.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Sales
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatCurrency(totalSales)} LKR</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {totalOrders.toLocaleString("en-US")}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {topGroupLabel}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{topMerchant}</p>
            </CardContent>
          </Card>
          <Card className="border-border/70 bg-card/95 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{topLocation}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {!hasDashboardData ? (
        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle>No dashboard data found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No dashboard data found for the selected range. Try widening the date
              range or switching the analysis type.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {hasDashboardData ? (
        <>
          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {primarySectionTitle}
              </h2>
              <p className="text-muted-foreground text-sm">
                {primarySectionDescription}
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {primaryMerchantCharts.map((chart) => (
                <MerchantChartCard key={chart.location} {...chart} />
              ))}
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {summaryMerchantCharts.map((chart) => (
                <MerchantChartCard
                  key={chart.location}
                  {...chart}
                  size="large"
                  variant="summary"
                />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">
                Operational Summary
              </h2>
              <p className="text-muted-foreground text-sm">
                Use these comparisons to spot where demand and fulfillment are strongest.
              </p>
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <MerchantBreakdownChart data={merchantBreakdownData} compact />
              <MerchantBreakdownChart
                data={shopBreakdownData}
                title="Shop Sales Analysis"
                description="Compare invoice value and order count by location and source."
                compact
              />
            </div>
            <DeliverySummaryChart data={deliverySummaryData} />
          </section>
        </>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Detailed Analysis</h2>
          <p className="text-muted-foreground text-sm">
            Lower-priority diagnostics for team activity, product mix, and recent
            updates.
          </p>
        </div>
        <div className="space-y-5">
          <CallCenterPerformanceChart data={callCenterPerformanceData} />
          <SalesPerformanceAnalysisChart data={salesPerformanceData} />
          <RecentItemsList items={items} />
        </div>
      </section>
    </div>
  );
}
