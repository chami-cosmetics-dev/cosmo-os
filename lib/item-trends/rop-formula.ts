import { roundHalfUp } from "@/lib/osf/assist-window";

/** Highest calendar-month units in a SKU's monthly buckets (Colombo YYYY-MM). */
export function peakMonthSales(monthly: Map<string, number> | undefined): {
  peakMonthSales: number;
  peakMonth: string | null;
  windowSales: number;
} {
  let peakUnits = 0;
  let peakMonth: string | null = null;
  let windowSales = 0;
  if (!monthly || monthly.size === 0) {
    return { peakMonthSales: 0, peakMonth: null, windowSales: 0 };
  }
  for (const [month, units] of monthly) {
    windowSales += units;
    if (units > peakUnits || (units === peakUnits && (peakMonth == null || month > peakMonth))) {
      peakUnits = units;
      peakMonth = month;
    }
  }
  return { peakMonthSales: peakUnits, peakMonth, windowSales };
}

export function suggestedRopFromPeakMonth(peakUnits: number): number {
  return roundHalfUp(Math.max(0, peakUnits) * 2);
}
