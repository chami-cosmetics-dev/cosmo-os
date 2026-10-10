/** Pure merge of product search hits from the Cosmo product list and ERP item lists. */

export type ProductSearchHit = {
  sku: string;
  title: string;
  variantTitle: string | null;
  imageUrl: string | null;
  shopifyVariantId: string | null;
  productHandle: string | null;
  /** In the Cosmo product list (synced from Shopify), so it has a website product page. */
  onWebsite: boolean;
  /** Found in at least one ERP item list. */
  inErp: boolean;
};

export type WebProductRow = {
  sku: string | null;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  shopifyVariantId: string | null;
  handle: string | null;
};

export type ErpItemRow = {
  item_code?: string | null;
  item_name?: string | null;
};

/**
 * One hit per SKU (case-insensitive). Website data wins for title/image/link; ERP-only items are
 * kept so staff can request things that are not on the website. Exact SKU match first, then
 * SKU prefix, then title.
 */
export function mergeProductSearchHits(
  web: WebProductRow[],
  erp: ErpItemRow[],
  query: string,
  limit = 20,
): ProductSearchHit[] {
  const bySku = new Map<string, ProductSearchHit>();
  for (const row of web) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const key = sku.toLowerCase();
    if (bySku.has(key)) continue;
    bySku.set(key, {
      sku,
      title: row.productTitle.trim() || sku,
      variantTitle: row.variantTitle && row.variantTitle !== "Default Title" ? row.variantTitle : null,
      imageUrl: row.imageUrl ?? null,
      shopifyVariantId: row.shopifyVariantId ?? null,
      productHandle: row.handle ?? null,
      onWebsite: true,
      inErp: false,
    });
  }
  for (const row of erp) {
    const sku = row.item_code?.trim();
    if (!sku) continue;
    const key = sku.toLowerCase();
    const existing = bySku.get(key);
    if (existing) {
      existing.inErp = true;
      continue;
    }
    bySku.set(key, {
      sku,
      title: row.item_name?.trim() || sku,
      variantTitle: null,
      imageUrl: null,
      shopifyVariantId: null,
      productHandle: null,
      onWebsite: false,
      inErp: true,
    });
  }

  const q = query.trim().toLowerCase();
  const rank = (hit: ProductSearchHit) => {
    const sku = hit.sku.toLowerCase();
    if (sku === q) return 0;
    if (sku.startsWith(q)) return 1;
    return 2;
  };
  return [...bySku.values()]
    .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
    .slice(0, limit);
}
