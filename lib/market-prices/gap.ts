import type { CompetitorPriceGaps, PriceLayerSnapshot } from "./types";

export type CompetitorStats = {
  count: number;
  min: number | null;
  max: number | null;
  median: number | null;
};

/**
 * Calculates min, max, and median from an array of numeric competitor prices.
 * Only positive, finite numbers are considered.
 */
export function calculateCompetitorStats(
  prices: Array<number | null | undefined>,
): CompetitorStats {
  const valid = prices
    .filter((p): p is number => p != null && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);

  if (valid.length === 0) {
    return {
      count: 0,
      min: null,
      max: null,
      median: null,
    };
  }

  const min = valid[0];
  const max = valid[valid.length - 1];

  let median: number;
  const mid = Math.floor(valid.length / 2);
  if (valid.length % 2 === 1) {
    median = valid[mid];
  } else {
    median = Math.round(((valid[mid - 1] + valid[mid]) / 2) * 100) / 100;
  }

  return {
    count: valid.length,
    min,
    max,
    median,
  };
}

/**
 * Calculates percentage gap: ((ourPrice - competitorRef) / competitorRef) * 100
 * Rounded to 1 decimal place.
 * Returns null if either price is null, zero, or negative.
 */
export function calculateGapPct(
  ourPrice: number | null | undefined,
  competitorRef: number | null | undefined,
): number | null {
  if (
    ourPrice == null ||
    competitorRef == null ||
    !Number.isFinite(ourPrice) ||
    !Number.isFinite(competitorRef) ||
    ourPrice <= 0 ||
    competitorRef <= 0
  ) {
    return null;
  }

  const raw = ((ourPrice - competitorRef) / competitorRef) * 100;
  return Math.round(raw * 10) / 10;
}

/**
 * Checks if our price is strictly cheaper than ALL valid competitor prices.
 * Requires at least one competitor price to compare against.
 */
export function isCheapestInMarket(
  ourPrice: number | null | undefined,
  competitorPrices: Array<number | null | undefined>,
): boolean {
  if (ourPrice == null || !Number.isFinite(ourPrice) || ourPrice <= 0) {
    return false;
  }

  const valid = competitorPrices.filter(
    (p): p is number => p != null && Number.isFinite(p) && p > 0,
  );

  if (valid.length === 0) return false;

  return valid.every((cp) => ourPrice < cp);
}

/**
 * Indicates if our price is significantly (> 5%) above competitor benchmark.
 */
export function isAboveMarket(gapPct: number | null | undefined): boolean {
  return gapPct != null && gapPct > 5;
}

/**
 * Calculates layer-specific gap percentages for a single competitor price.
 */
export function calculateSingleCompetitorGaps(
  ourPrices: PriceLayerSnapshot,
  competitorPrice: number | null | undefined,
): CompetitorPriceGaps {
  return {
    mrp: calculateGapPct(ourPrices.mrp, competitorPrice),
    promo: calculateGapPct(ourPrices.promo, competitorPrice),
    ogf: calculateGapPct(ourPrices.ogf, competitorPrice),
  };
}
