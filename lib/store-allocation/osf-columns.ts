import type { OsfResolvedColumn } from "@/lib/osf/column-config";

/** Cosmo / trading shop floors — excluded from store location allocation. */
export function isShopOsfColumn(col: Pick<OsfResolvedColumn, "key" | "label">): boolean {
  if (col.key.startsWith("cosmo_shop_") || col.key.includes("_shop_")) return true;
  if (/\bshop\b/i.test(col.label) || /shopwarehouse/i.test(col.label)) return true;
  return false;
}

export function filterStoreAllocationColumns(columns: OsfResolvedColumn[]): OsfResolvedColumn[] {
  return columns.filter((c) => c.active && c.includeInRop && !isShopOsfColumn(c));
}
