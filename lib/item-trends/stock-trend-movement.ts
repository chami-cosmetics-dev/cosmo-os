import { EARLY_AGE_DAYS, FAST_MOVER_SELL_THROUGH_PCT } from "@/lib/item-trends/stock-trends-config";

export const MOVEMENT_STATUSES = ["fast", "slow", "early", "na"] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

export type StockTrendMovementFields = {
  /** Whole days from createdDate to `today`, or null when there's no createdDate. */
  ageDays: number | null;
  /** unitsSold / unitsPurchased * 100, unrounded; null when nothing was purchased. */
  sellThroughPct: number | null;
  movementStatus: MovementStatus;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days between two "YYYY-MM-DD" dates, calendar-based (no time-of-day/DST drift). */
function daysBetweenYmd(fromYmd: string, toYmd: string): number | null {
  const parse = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return y && m && d ? Date.UTC(y, m - 1, d) : NaN;
  };
  const diff = parse(toYmd) - parse(fromYmd);
  return Number.isFinite(diff) ? Math.round(diff / DAY_MS) : null;
}

/**
 * Movement classification, evaluated in order:
 *   1. nothing purchased            → "na"
 *   2. younger than EARLY_AGE_DAYS  → "early"
 *   3. sell-through ≥ FAST_MOVER_SELL_THROUGH_PCT → "fast"
 *   4. otherwise                    → "slow"
 */
export function computeMovementFields(
  row: { createdDate: string | null; unitsPurchased: number; unitsSold: number },
  todayYmd: string,
): StockTrendMovementFields {
  const ageDays = row.createdDate ? daysBetweenYmd(row.createdDate, todayYmd) : null;
  const sellThroughPct = row.unitsPurchased > 0 ? (row.unitsSold / row.unitsPurchased) * 100 : null;

  let movementStatus: MovementStatus;
  if (row.unitsPurchased === 0) movementStatus = "na";
  else if (ageDays !== null && ageDays < EARLY_AGE_DAYS) movementStatus = "early";
  else if (sellThroughPct !== null && sellThroughPct >= FAST_MOVER_SELL_THROUGH_PCT) movementStatus = "fast";
  else movementStatus = "slow";

  return { ageDays, sellThroughPct, movementStatus };
}

/** Rows per movement status — always has every key, zero-filled. */
export function countByMovement(rows: { movementStatus: MovementStatus }[]): Record<MovementStatus, number> {
  const counts: Record<MovementStatus, number> = { fast: 0, slow: 0, early: 0, na: 0 };
  for (const row of rows) counts[row.movementStatus] += 1;
  return counts;
}
