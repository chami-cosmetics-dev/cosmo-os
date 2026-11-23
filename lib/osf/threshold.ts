import { Prisma } from "@prisma/client";

/**
 * Reorder threshold % helpers for filtered OSF + purchasing reminders.
 * Null/unset profile threshold ⇒ effective 70 (Excel-style cue).
 */

export const DEFAULT_REORDER_THRESHOLD_PERCENT = 70;

export function effectiveReorderThresholdPercent(
  thresholdPercent: number | null | undefined,
): number {
  if (
    thresholdPercent == null ||
    !Number.isFinite(thresholdPercent) ||
    thresholdPercent < 1 ||
    thresholdPercent > 100
  ) {
    return DEFAULT_REORDER_THRESHOLD_PERCENT;
  }
  return thresholdPercent;
}

/**
 * True when totalStock / totalRop is strictly below the threshold %.
 * Unevaluable (false) when totalRop ≤ 0.
 */
export function isBelowReorderThreshold(
  totalStock: number | null | undefined,
  totalRop: number | null | undefined,
  thresholdPercent?: number | null,
): boolean {
  if (totalRop == null || !Number.isFinite(totalRop) || totalRop <= 0) return false;
  if (totalStock == null || !Number.isFinite(totalStock)) return false;
  const stock = totalStock;
  const threshold = effectiveReorderThresholdPercent(thresholdPercent);
  return new Prisma.Decimal(stock).times(100).lt(new Prisma.Decimal(totalRop).times(threshold));
}
