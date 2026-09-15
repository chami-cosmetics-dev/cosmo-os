/** Blank (unset) vs a real number. null stays blank in Excel. */
export function sumNullable(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0);
}

export function maxSale(monthTotals: Array<number | null | undefined>): number | null {
  const nums = monthTotals.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.max(...nums);
}

/**
 * AVE = total sales ÷ count of months that have a sale value.
 * Blank months (no ERP/import cell) are excluded from the divisor.
 */
export function averageMonthlySale(
  monthTotals: Array<number | null | undefined>,
  _monthCount?: number,
): number | null {
  const nums = monthTotals.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  const total = nums.reduce((a, b) => a + b, 0);
  return total / nums.length;
}

/** Legacy months-of-cover helper (stock ÷ peak month). Not used for AVE. */
export function monthsOfCover(totalStock: number | null, max: number | null): number | null {
  if (totalStock == null || max == null || max === 0) return null;
  return totalStock / max;
}

export function reorderQty(rop: number | null | undefined, stock: number): number | null {
  if (rop == null || !Number.isFinite(rop)) return null;
  return rop - stock;
}
