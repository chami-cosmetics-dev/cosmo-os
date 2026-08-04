import type { WorkingOrderRow } from "@/lib/osf/supplier-orders-draft";

/** Sum of allocation qtys with qty > 0 (zero/negative lines ignored). */
export function rowAllocatedSum(row: WorkingOrderRow): number {
  let sum = 0;
  for (const allocation of row.allocations) {
    if (allocation.qty > 0) sum += allocation.qty;
  }
  return sum;
}

/** True when reorderQty > 0 and positive allocations exceed reorderQty. */
export function isRowOverAllocated(row: WorkingOrderRow): boolean {
  if (row.reorderQty <= 0) return false;
  return rowAllocatedSum(row) > row.reorderQty;
}

export type ValidateDraftForGenerateResult =
  | { ok: true }
  | { ok: false; error: string; skus?: string[] };

/**
 * Validate a draft before generate: require ≥1 positive allocation; block over-allocation.
 * Ignores allocations with qty ≤ 0.
 */
export function validateDraftForGenerate(
  rows: WorkingOrderRow[],
): ValidateDraftForGenerateResult {
  let hasPositive = false;
  const overAllocated: string[] = [];

  for (const row of rows) {
    const sum = rowAllocatedSum(row);
    if (sum > 0) hasPositive = true;
    if (isRowOverAllocated(row)) overAllocated.push(row.sku);
  }

  if (overAllocated.length > 0) {
    return {
      ok: false,
      error: "One or more rows are over-allocated",
      skus: overAllocated,
    };
  }

  if (!hasPositive) {
    return {
      ok: false,
      error: "At least one allocation with quantity greater than zero is required",
    };
  }

  return { ok: true };
}
