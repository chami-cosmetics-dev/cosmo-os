import type { WorkingOrderRow } from "@/lib/osf/supplier-orders-draft";

/** Sum of allocation qtys with qty > 0 (zero/negative lines ignored). */
export function rowAllocatedSum(row: WorkingOrderRow): number {
  let sum = 0;
  for (const allocation of row.allocations) {
    if (allocation.qty > 0) sum += allocation.qty;
  }
  return sum;
}

/** True when reorderQty > 0 and positive allocations exceed reorderQty (warning only — generate still allowed). */
export function isRowOverAllocated(row: WorkingOrderRow): boolean {
  if (row.reorderQty <= 0) return false;
  return rowAllocatedSum(row) > row.reorderQty;
}

/** SKUs where allocated qty exceeds OSF reorder qty (for UI / soft warnings). */
export function overAllocatedSkus(rows: WorkingOrderRow[]): string[] {
  return rows.filter(isRowOverAllocated).map((row) => row.sku);
}

export type ValidateDraftForGenerateResult =
  | { ok: true }
  | { ok: false; error: string; skus?: string[] };

/**
 * Validate a draft before generate: require ≥1 positive allocation.
 * Over-ROP allocations are allowed (callers may warn via `overAllocatedSkus` / `isRowOverAllocated`).
 */
export function validateDraftForGenerate(
  rows: WorkingOrderRow[],
): ValidateDraftForGenerateResult {
  let hasPositive = false;

  for (const row of rows) {
    if (rowAllocatedSum(row) > 0) hasPositive = true;
  }

  if (!hasPositive) {
    return {
      ok: false,
      error: "At least one allocation with quantity greater than zero is required",
    };
  }

  return { ok: true };
}
