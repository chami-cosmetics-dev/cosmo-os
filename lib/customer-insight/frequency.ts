import type { FrequencyDto } from "@/lib/customer-insight/types";

/** Dates of loyalty-eligible documents (orders + adapt). */
export function buildFrequencyMetrics(dates: Date[]): FrequencyDto {
  if (dates.length === 0) {
    return {
      orderCount: 0,
      firstOrderAt: null,
      lastOrderAt: null,
      avgDaysBetweenOrders: null,
    };
  }

  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  let avgDaysBetweenOrders: number | null = null;
  if (sorted.length >= 2) {
    const spanMs = last.getTime() - first.getTime();
    const gaps = sorted.length - 1;
    avgDaysBetweenOrders = Math.round((spanMs / gaps / 86_400_000) * 10) / 10;
  }

  return {
    orderCount: sorted.length,
    firstOrderAt: first.toISOString(),
    lastOrderAt: last.toISOString(),
    avgDaysBetweenOrders,
  };
}
