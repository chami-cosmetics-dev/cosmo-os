"use client";

import { DashboardSalesCharts } from "@/components/organisms/dashboard-sales-charts";

interface DashboardSalesAnalysisChartProps {
  stats: Array<{
    shop: string;
    total: string;
    invoiceCount?: number;
  }>;
  dateType: "order" | "completed";
}

export function DashboardSalesAnalysisChart({
  stats,
  dateType,
}: DashboardSalesAnalysisChartProps) {
  return <DashboardSalesCharts stats={stats} dateType={dateType} />;
}
