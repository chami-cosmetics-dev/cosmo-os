export type StickerPriceInputs = {
  price: string | number | null | undefined;
  compareAtPrice?: string | number | null | undefined;
  /** Cosmo ERP "OGF Price List" rate for LWK. */
  lwkErpPrice?: string | number | null | undefined;
  /** Cosmo ERP "Standard Selling" rate for non-LWK stickers. */
  standardSellingErpPrice?: string | number | null | undefined;
  isLwk: boolean;
};

function toMoney(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/**
 * LWK detection:
 * - locationReference is "LWK" (legacy / alternate setups), OR
 * - location name contains "LWK" (Cosmo uses refs like "003" for LWK Enterprises)
 */
export function isLwkLocation(
  locationReference: string | null | undefined,
  locationName?: string | null | undefined
): boolean {
  const ref = (locationReference ?? "").trim().toUpperCase();
  if (ref === "LWK") return true;
  const name = (locationName ?? "").trim().toUpperCase();
  return name.includes("LWK");
}

/** Case-insensitive lookup into sku → price map. */
export function lookupErpPriceBySku(
  priceBySku: Record<string, string>,
  sku: string | null | undefined
): string | undefined {
  const key = (sku ?? "").trim();
  if (!key) return undefined;
  if (priceBySku[key] != null) return priceBySku[key];
  const upper = key.toUpperCase();
  if (priceBySku[upper] != null) return priceBySku[upper];
  const hit = Object.entries(priceBySku).find(([k]) => k.toUpperCase() === upper);
  return hit?.[1];
}

/** @deprecated Use lookupErpPriceBySku */
export const lookupLwkErpPrice = lookupErpPriceBySku;

/**
 * Resolve sticker unit price:
 * - LWK → Cosmo ERP OGF Price List (no Cosmo/Shopify fallback)
 * - other → Cosmo ERP Standard Selling, then compare-at, then sell price
 */
export function resolveStickerUnitPrice(input: StickerPriceInputs): string {
  if (input.isLwk) {
    return toMoney(input.lwkErpPrice) ?? "";
  }
  return (
    toMoney(input.standardSellingErpPrice) ??
    toMoney(input.compareAtPrice) ??
    toMoney(input.price) ??
    ""
  );
}
