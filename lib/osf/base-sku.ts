/**
 * Strip trailing variant suffix `_N` or `-N` for Common SKU grouping.
 * Examples: CAN07_1 → CAN07, CAN07-2 → CAN07, ABC → ABC
 */
export function baseSku(sku: string): string {
  const trimmed = sku.trim();
  if (!trimmed) return "";
  return trimmed.replace(/[_-]\d+$/, "");
}
