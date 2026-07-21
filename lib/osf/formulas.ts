/**
 * Suggested order qty = ROP − stock (may be negative when stock exceeds ROP).
 * Blank when ROP is missing.
 */
export function orderQty(rop: number | null | undefined, stock: number | null | undefined): number | null {
  if (rop == null || !Number.isFinite(rop)) return null;
  const s = stock == null || !Number.isFinite(stock) ? 0 : stock;
  return Math.floor(rop) - Math.floor(s);
}

/** Sum only positive order qtys for TOTAL / Common buy aggregates. */
export function sumPositiveOrderQtys(values: Array<number | null | undefined>): number {
  let sum = 0;
  for (const v of values) {
    if (v != null && Number.isFinite(v) && v > 0) sum += v;
  }
  return sum;
}

/** Stock as % of ROP. Blank when ROP missing or zero. */
export function percentOfRop(stock: number | null | undefined, rop: number | null | undefined): number | null {
  if (rop == null || !Number.isFinite(rop) || rop <= 0) return null;
  const s = stock == null || !Number.isFinite(stock) ? 0 : stock;
  return s / rop;
}

export function seventyPercentOfRop(rop: number | null | undefined): number | null {
  if (rop == null || !Number.isFinite(rop)) return null;
  return rop * 0.7;
}

/**
 * Label comparing stock to 70% of total ROP (Excel-style availability cue).
 * Blank when ROP missing.
 */
export function seventyPercentAvailabilityLabel(
  stock: number | null | undefined,
  rop: number | null | undefined,
): string | null {
  const threshold = seventyPercentOfRop(rop);
  if (threshold == null) return null;
  const s = stock == null || !Number.isFinite(stock) ? 0 : stock;
  if (s >= threshold) return "Above 70%";
  return "Below 70%";
}

/**
 * Original/list selling price for margin: compare-at (MRP) when set, else catalog sell price.
 * When a SKU is not on sale, sell price is the original — there is no separate discount.
 */
export function originalSellingPrice(
  mrp: number | null | undefined,
  discountedPrice: number | null | undefined,
): number | null {
  if (mrp != null && Number.isFinite(mrp) && mrp !== 0) return mrp;
  if (discountedPrice != null && Number.isFinite(discountedPrice) && discountedPrice !== 0) {
    return discountedPrice;
  }
  return null;
}

/** Cosmetics Margin = (original sell − cost) / original sell when both exist and sell ≠ 0. */
export function cosmeticsMargin(
  mrp: number | null | undefined,
  cost: number | null | undefined,
): number | null {
  if (mrp == null || cost == null || !Number.isFinite(mrp) || !Number.isFinite(cost) || mrp === 0) {
    return null;
  }
  return (mrp - cost) / mrp;
}

/**
 * OGF Margin = (OGF Price − cost) / OGF Price when both exist and OGF ≠ 0.
 * Independent of LWK — blank when OGF Price missing.
 */
export function ogfMargin(
  ogfPrice: number | null | undefined,
  cost: number | null | undefined,
): number | null {
  if (
    ogfPrice == null ||
    cost == null ||
    !Number.isFinite(ogfPrice) ||
    !Number.isFinite(cost) ||
    ogfPrice === 0
  ) {
    return null;
  }
  return (ogfPrice - cost) / ogfPrice;
}

export function formatMarginPercent(value: number | null): string | number | null {
  if (value == null) return null;
  return Math.round(value * 10000) / 100;
}
