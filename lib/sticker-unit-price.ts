export type StickerPriceInputs = {
  /** Cosmo ERP "OGF Price List" rate for LWK. */
  lwkErpPrice?: string | number | null | undefined;
  /** Cosmo ERP "Standard Selling" rate for non-LWK stickers. */
  standardSellingErpPrice?: string | number | null | undefined;
  /**
   * OS catalog / ProductItem.price (Shopify or last synced sell).
   * Non-LWK only: used when Standard Selling is missing or ≤ 0.
   */
  catalogPrice?: string | number | null | undefined;
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
 * Prefer primary ERP rates; fill SKUs still missing (or ≤ 0) from fallback map.
 * Case-insensitive SKU match via lookupErpPriceBySku.
 */
export function mergeErpPriceMapsPreferPrimary(
  primary: Record<string, string>,
  fallback: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = { ...primary };
  for (const [rawSku, price] of Object.entries(fallback)) {
    const sku = rawSku.trim();
    if (!sku || !toMoney(price)) continue;
    if (lookupErpPriceBySku(out, sku)) continue;
    out[sku] = toMoney(price)!;
  }
  return out;
}

/**
 * Resolve sticker unit price:
 * - LWK → Cosmo ERP OGF Price List only (no Cosmo/Shopify fallback)
 * - other → Cosmo ERP Standard Selling, else OS catalog ProductItem.price
 *   (covers ERP rows at 0 / missing while Product Items still show sell price)
 */
export function resolveStickerUnitPrice(input: StickerPriceInputs): string {
  if (input.isLwk) {
    return toMoney(input.lwkErpPrice) ?? "";
  }
  return (
    toMoney(input.standardSellingErpPrice) ??
    toMoney(input.catalogPrice) ??
    ""
  );
}
