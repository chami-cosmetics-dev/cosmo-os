import {
  CUSTOMER_INSIGHT_CHART_MIN_DOCS,
  type SeriesPointDto,
} from "@/lib/customer-insight/types";

export type SeriesEvent = {
  date: Date;
  amount: number;
  includedInLoyaltyTotal: boolean;
};

function monthKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function buildMonthlySeries(events: SeriesEvent[]): {
  series: SeriesPointDto[];
  chartsAvailable: boolean;
  loyaltyEligibleCount: number;
} {
  const eligible = events.filter((e) => e.includedInLoyaltyTotal);
  const byMonth = new Map<string, { spend: number; orderCount: number }>();

  for (const event of eligible) {
    const key = monthKey(event.date);
    const prev = byMonth.get(key) ?? { spend: 0, orderCount: 0 };
    prev.spend += event.amount;
    prev.orderCount += 1;
    byMonth.set(key, prev);
  }

  const series = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      spend: Math.round(v.spend * 100) / 100,
      orderCount: v.orderCount,
    }));

  return {
    series,
    chartsAvailable: eligible.length >= CUSTOMER_INSIGHT_CHART_MIN_DOCS,
    loyaltyEligibleCount: eligible.length,
  };
}
