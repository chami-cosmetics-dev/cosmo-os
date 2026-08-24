export function normalizeNmrItemCode(itemCode: string): string {
  return itemCode.trim().toUpperCase();
}

export function isNmrApprovedItemCode(
  approvedItemCodes: ReadonlySet<string>,
  itemCode: string | null | undefined,
): boolean {
  if (!itemCode) return false;
  return approvedItemCodes.has(normalizeNmrItemCode(itemCode));
}
