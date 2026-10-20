const BUNDLE_WORD = /\bbundles?\b/i;
/** Cosmetics.lk bundle packs, e.g. BU006_1 or SV_BU001_1. */
const BUNDLE_SKU = /^(?:sv[_-]?)?bu\d/i;

/** Combo / bundle catalog rows are not real stock or price subjects. */
export function isBundleCatalogItem(item: {
  sku?: string | null;
  productTitle?: string | null;
  productType?: string | null;
}): boolean {
  if (BUNDLE_WORD.test(item.productType ?? "") || BUNDLE_WORD.test(item.productTitle ?? "")) {
    return true;
  }
  return BUNDLE_SKU.test((item.sku ?? "").trim());
}
