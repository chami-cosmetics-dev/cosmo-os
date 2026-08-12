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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match: "Ordinary" hits "The Ordinary", not "Extraordinary". */
export function textContainsBrandWord(
  text: string | null | undefined,
  brand: string
): boolean {
  const hay = text?.trim() ?? "";
  const needle = brand.trim();
  if (!hay || !needle) return false;
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`, "i");
  return re.test(hay);
}

export function brandsMatch(
  lineBrand: string | null | undefined,
  filterBrand: string
): boolean {
  const a = lineBrand?.trim().toLowerCase();
  const b = filterBrand.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return textContainsBrandWord(lineBrand, filterBrand);
}

/** Vendor whole-word or title whole-word. "Ordinary" ≠ "Extraordinary". */
export function lineMatchesBrand(
  brand: string,
  input: { vendorName?: string | null; productTitle?: string | null }
): boolean {
  if (brandsMatch(input.vendorName, brand)) return true;
  return textContainsBrandWord(input.productTitle, brand);
}
