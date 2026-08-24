/**
 * Difference = count − live stock sum.
 * null count → not counted (null).
 * null stockSum → unavailable (null).
 */
export function difference(count: number | null, stockSum: number | null): number | null {
  if (count == null) return null;
  if (stockSum == null || !Number.isFinite(stockSum)) return null;
  if (!Number.isFinite(count)) return null;
  return count - stockSum;
}
