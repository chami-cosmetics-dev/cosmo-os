/**
 * Strip trailing variant suffix `_N` or `-N` for Common SKU grouping.
 * Examples: CAN07_1 → CAN07, CAN07-2 → CAN07, ABC → ABC
 */
export function baseSku(sku: string): string {
  const trimmed = sku.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[_-]\d+$/, "");
}

/** Catalog `_1` and ERP `-1` (and the reverse) for the same item. */
export function skuVariantKeys(sku: string): string[] {
  const trimmed = sku.trim();
  if (!trimmed) return [];
  const keys = [trimmed];
  const underscored = trimmed.replace(/-(\d+)$/, "_$1");
  const hyphen = trimmed.replace(/_(\d+)$/, "-$1");
  if (underscored !== trimmed) keys.push(underscored);
  if (hyphen !== trimmed && !keys.includes(hyphen)) keys.push(hyphen);
  return keys;
}

export function mapGetBySku<T>(map: Map<string, T>, sku: string): T | undefined {
  for (const key of skuVariantKeys(sku)) {
    const hit = map.get(key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
