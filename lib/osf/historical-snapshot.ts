/**
 * Past as-of OSF snapshot helpers.
 * Stock is current bin minus ledger qty posted after the as-of day.
 * Sales for the as-of month must not fall back to a full month that runs past that day.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when asOfDate is a calendar day before today (both YYYY-MM-DD). */
export function isOsfHistoricalAsOf(asOfDate: string, todayIso: string): boolean {
  return ISO_DATE.test(asOfDate) && ISO_DATE.test(todayIso) && asOfDate < todayIso;
}

/**
 * End-of-day qty = current bin − sum of Stock Ledger actual_qty posted after as-of.
 * Keys are `${warehouse}::${itemCode}`, the same key stock columns use.
 */
export function stockAsOfFromLaterMovements(
  currentBins: Map<string, number>,
  qtyPostedAfter: Map<string, number>,
): Map<string, number> {
  const keys = new Set<string>([...currentBins.keys(), ...qtyPostedAfter.keys()]);
  const out = new Map<string, number>();
  for (const key of keys) {
    const current = currentBins.get(key) ?? 0;
    const after = qtyPostedAfter.get(key) ?? 0;
    out.set(key, Math.round((current - after) * 1e6) / 1e6);
  }
  return out;
}

/**
 * Sales qty for one OSF month column.
 * Grid qty is already clipped at as-of. A past as-of must not replace a missing
 * as-of-month cell with the unclipped full-month total.
 * A month that ended before the as-of month can use that full-month total.
 * A month after as-of has no figure for that day.
 */
export function osfSheetSalesQty(input: {
  historical: boolean;
  month: string;
  asOfDate: string;
  gridQty: number | undefined;
  fullMonthQty: number | undefined;
}): number | null {
  if (input.gridQty != null) return input.gridQty;
  if (!input.historical) return input.fullMonthQty ?? 0;
  const asOfMonth = input.asOfDate.slice(0, 7);
  if (input.month < asOfMonth) return input.fullMonthQty ?? 0;
  if (input.month === asOfMonth) return 0;
  return null;
}
