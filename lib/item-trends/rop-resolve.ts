export type SkuGrainLike = "common" | "separate" | "variant";

function ropKey(sku: string, columnKey: string): string {
  return `${sku}::${columnKey}`;
}

/**
 * Location-wise ROP for a cover row.
 * - Separate/variant: ROP for that SKU × column.
 * - Common parent: prefer commonSkuKey × column; else unanimous child ROP; else single child ROP; never sum.
 */
export function resolveLocationRopQty(input: {
  grain: SkuGrainLike;
  sku: string;
  commonSkuKey: string;
  columnKey: string;
  /** Map of `${sku}::${columnKey}` → ropQty for rows that exist in ProductOsfRop. */
  ropBySkuColumn: Map<string, number>;
  /** Variant SKUs under the parent when grain is common. */
  childSkus?: string[];
}): number | null {
  const { columnKey, ropBySkuColumn } = input;
  const grain = input.grain === "variant" ? "separate" : input.grain;

  if (grain === "separate") {
    const key = ropKey(input.sku, columnKey);
    return ropBySkuColumn.has(key) ? (ropBySkuColumn.get(key) as number) : null;
  }

  const parentKey = ropKey(input.commonSkuKey || input.sku, columnKey);
  if (ropBySkuColumn.has(parentKey)) {
    return ropBySkuColumn.get(parentKey) as number;
  }

  const children = (input.childSkus ?? []).map((s) => s.trim()).filter(Boolean);
  const childValues: number[] = [];
  for (const child of children) {
    const key = ropKey(child, columnKey);
    if (ropBySkuColumn.has(key)) {
      childValues.push(ropBySkuColumn.get(key) as number);
    }
  }

  if (childValues.length === 0) return null;
  if (childValues.length === 1) return childValues[0]!;
  const first = childValues[0]!;
  if (childValues.every((v) => v === first)) return first;
  return null;
}

export function ropMapKey(sku: string, columnKey: string): string {
  return ropKey(sku, columnKey);
}
