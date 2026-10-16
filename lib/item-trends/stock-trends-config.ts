/**
 * Tunable thresholds for the Stock Trends tab. Client-safe (no server-only
 * imports) so the panel's legend and the server's movement logic read the
 * same values.
 */

/** Default "Created from" is this many months before today. */
export const STOCK_TRENDS_DEFAULT_RANGE_MONTHS = 3;

/** Sell-through % at or above which an item is a "fast" mover. */
export const FAST_MOVER_SELL_THROUGH_PCT = 50;

/** Items younger than this many days are "early" — too new to judge. */
export const EARLY_AGE_DAYS = 30;
