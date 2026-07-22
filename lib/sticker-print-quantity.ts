export type QuantityItem = {
  quantity: number;
};

/** Clamp to a positive integer; invalid/zero → 1 (API normally sends positives). */
export function normalizeQuantity(quantity: number): number {
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.floor(quantity);
}

/**
 * Expand batch line items into one entry per printed label copy.
 * Length of result === totalStickerCount(items).
 */
export function expandItemsByQuantity<T extends QuantityItem>(
  items: T[]
): Array<{ item: T; copyIndex: number }> {
  const result: Array<{ item: T; copyIndex: number }> = [];
  for (const item of items) {
    const qty = normalizeQuantity(item.quantity);
    for (let copyIndex = 1; copyIndex <= qty; copyIndex += 1) {
      result.push({ item, copyIndex });
    }
  }
  return result;
}

/** Total labels that will print = sum of normalized quantities. */
export function totalStickerCount(items: QuantityItem[]): number {
  return items.reduce((sum, item) => sum + normalizeQuantity(item.quantity), 0);
}
