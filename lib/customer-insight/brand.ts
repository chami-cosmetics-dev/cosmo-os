/**
 * Brand resolution for Cosmo ProductItem (Vendor.name) and Adapt line JSON.
 * Unknown / missing brand → null (does not invent brands).
 */

export function brandFromVendorName(vendorName: string | null | undefined): string | null {
  const trimmed = vendorName?.trim();
  return trimmed || null;
}

/** Extract brand from Adapt line item JSON if present. */
export function brandFromAdaptLineItem(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  for (const key of ["brand", "Brand", "vendor", "Vendor", "itemBrand"]) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function brandsMatch(
  lineBrand: string | null | undefined,
  filterBrand: string
): boolean {
  const a = lineBrand?.trim().toLowerCase();
  const b = filterBrand.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b;
}
