"use client";

import { ChartPieDonutText } from "@/components/molecules/chart-pie-donut-text";

interface MerchantChartSegment {
  value: number;
  color: string;
}

interface MerchantChartCardProps {
  location: string;
  total: number;
  merchant: string;
  merchantValue: number;
  segments: MerchantChartSegment[];
  size?: "default" | "large";
  variant?: "default" | "summary";
}

export function MerchantChartCard({
  location,
  total,
  merchant,
  merchantValue,
  segments,
  size,
  variant = "default",
}: MerchantChartCardProps) {
  return (
    <ChartPieDonutText
      shopName={location}
      merchantName={merchant}
      merchantValue={merchantValue}
      centerLabel="Orders"
      totalValue={total}
      size={size}
      variant={variant}
      segments={segments.map((segment, index) => ({
        label: `Segment ${index + 1}`,
        value: segment.value,
        color: segment.color,
      }))}
    />
  );
}
