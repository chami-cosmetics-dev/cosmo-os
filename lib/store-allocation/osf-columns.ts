import type { OsfResolvedColumn } from "@/lib/osf/column-config";

/** Cosmo retail shops (GCC Shop, Pepiliyana Shop, …) — excluded from store location allocation. */
export function isShopOsfColumn(col: Pick<OsfResolvedColumn, "key" | "label">): boolean {
  if (col.key.startsWith("cosmo_shop_")) return true;
  if (/\bshop\b/i.test(col.label)) return true;
  return false;
}

export function filterStoreAllocationColumns(columns: OsfResolvedColumn[]): OsfResolvedColumn[] {
  return columns.filter((c) => c.active && c.includeInRop && !isShopOsfColumn(c));
}
