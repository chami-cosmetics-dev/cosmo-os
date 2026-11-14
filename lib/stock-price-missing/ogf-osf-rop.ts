import type { StockPriceMissingGap } from "@/lib/stock-price-missing/gap";

/**
 * OSF columns that mean "this SKU is allowed at OGF".
 * LWK is the OGF shop; Cosmo also has an OGF Shop warehouse column.
 */
export function isOgfOsfColumn(col: {
  key: string;
  label: string;
  companyLocationName?: string | null;
  warehouses?: string[];
}): boolean {
  const blobs = [
    col.key,
    col.label,
    col.companyLocationName ?? "",
    ...(col.warehouses ?? []),
  ];
  const tokens = new Set<string>();
  for (const blob of blobs) {
    for (const token of blob.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token) tokens.add(token);
    }
  }
  return tokens.has("ogf") || tokens.has("lwk");
}

export function ogfRopColumnKeys(
  columns: Array<{
    key: string;
    label: string;
    active: boolean;
    includeInRop: boolean;
    companyLocationName?: string | null;
    warehouses?: string[];
  }>,
): string[] {
  return columns
    .filter((c) => c.active && c.includeInRop && isOgfOsfColumn(c))
    .map((c) => c.key);
}

/**
 * No OSF OGF/LWK ROP means item is not allowed at OGF — drop OGF-missing.
 * `hasOgfRop === null` leaves the gap unchanged (OGF columns not configured).
 */
export function applyOgfRopGate(
  gap: StockPriceMissingGap | null,
  hasOgfRop: boolean | null,
): StockPriceMissingGap | null {
  if (hasOgfRop !== false) return gap;
  if (gap === "OGF") return null;
  if (gap === "Both") return "Standard";
  return gap;
}
