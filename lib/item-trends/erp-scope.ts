export type ErpStockScope = "both" | "erp1" | "erp2";

export function allowedInstanceIds(
  scope: ErpStockScope,
  slots: { erp1: string | null; erp2: string | null },
): Set<string> | null {
  if (scope === "both") return null;
  const id = scope === "erp1" ? slots.erp1 : slots.erp2;
  return new Set(id ? [id] : []);
}

export function columnMatchesErpScope(
  columnInstanceId: string | null | undefined,
  allowedIds: Set<string> | null,
): boolean {
  if (!allowedIds) return true;
  if (allowedIds.size === 0) return false;
  return Boolean(columnInstanceId && allowedIds.has(columnInstanceId));
}
