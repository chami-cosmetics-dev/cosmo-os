/**
 * Purchasing calculator math — margin and supplier price-change %.
 * Mirrors Cosmetics-style (price − cost) / price denominators.
 */

/** Margin = (selling − purchase) / selling when both valid and selling ≠ 0. */
export function sellingMargin(
  selling: number | null | undefined,
  purchase: number | null | undefined,
): number | null {
  if (
    selling == null ||
    purchase == null ||
    !Number.isFinite(selling) ||
    !Number.isFinite(purchase) ||
    selling === 0
  ) {
    return null;
  }
  return (selling - purchase) / selling;
}

/**
 * Invert margin: selling = purchase / (1 − marginFraction).
 * Margin fraction is e.g. 0.6 for 60%. Requires margin < 1 so denominator ≠ 0.
 */
export function sellingFromMargin(
  purchase: number | null | undefined,
  marginFraction: number | null | undefined,
): number | null {
  if (
    purchase == null ||
    marginFraction == null ||
    !Number.isFinite(purchase) ||
    !Number.isFinite(marginFraction) ||
    marginFraction >= 1
  ) {
    return null;
  }
  return purchase / (1 - marginFraction);
}

/** Price change = (new − last) / last when both valid and last ≠ 0. */
export function supplierPriceChangePercent(
  lastPrice: number | null | undefined,
  newPrice: number | null | undefined,
): number | null {
  if (
    lastPrice == null ||
    newPrice == null ||
    !Number.isFinite(lastPrice) ||
    !Number.isFinite(newPrice) ||
    lastPrice === 0
  ) {
    return null;
  }
  return (newPrice - lastPrice) / lastPrice;
}

export function formatPercentPoints(value: number | null): number | null {
  if (value == null) return null;
  return Math.round(value * 10000) / 100;
}
