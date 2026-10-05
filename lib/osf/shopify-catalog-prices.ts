import type { OsfCatalogRow } from "@/lib/osf/catalog-rows";
import { normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";
import { normalizeShopifyStoreHandle } from "@/lib/shopify-admin";

export type ShopifyCatalogPrice = {
  price: number;
  compareAtPrice: number | null;
};

export type ShopifyStoreLocation = {
  shopifyAdminStoreHandle: string | null;
  name: string;
  isMainCompany: boolean;
  locationReference: string | null;
};

export function parseShopifyMoney(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function pickShopifyStoreHandle(locations: ShopifyStoreLocation[]): string | null {
  const withHandle = locations
    .map((loc) => ({
      ...loc,
      handle: normalizeShopifyStoreHandle(loc.shopifyAdminStoreHandle ?? ""),
    }))
    .filter((loc) => loc.handle);
  if (withHandle.length === 0) return null;
  const cosmetics = withHandle.find(
    (loc) =>
      /cosmetic/i.test(loc.name) ||
      /cosmetic/i.test(loc.locationReference ?? "") ||
      /cosmetic/i.test(loc.handle),
  );
  if (cosmetics) return cosmetics.handle;
  const main = withHandle.find((loc) => loc.isMainCompany);
  return (main ?? withHandle[0]!).handle;
}

export function collectShopifyVariantPrices(
  nodes: Array<{
    sku?: string | null;
    price?: string | number | null;
    compareAtPrice?: string | number | null;
  }>,
  into: Map<string, ShopifyCatalogPrice>,
): void {
  for (const node of nodes) {
    const key = normalizeSkuKey(node.sku);
    if (!key || into.has(key)) continue;
    const price = parseShopifyMoney(node.price);
    if (price == null) continue;
    into.set(key, {
      price,
      compareAtPrice: parseShopifyMoney(node.compareAtPrice),
    });
  }
}

/**
 * Overlay live Shopify variant sell / compare-at onto OSF catalog rows.
 * ProductItem.price is ERP Standard Selling and is not the site sale price.
 */
export function applyShopifyPricesToCatalog<
  T extends Pick<OsfCatalogRow, "sku" | "mrp" | "discountedPrice">,
>(catalog: T[], pricesBySku: Map<string, ShopifyCatalogPrice>): T[] {
  if (pricesBySku.size === 0) return catalog;
  return catalog.map((row) => {
    const hit = pricesBySku.get(normalizeSkuKey(row.sku));
    if (!hit) return row;
    return {
      ...row,
      discountedPrice: hit.price,
      mrp: hit.compareAtPrice,
    };
  });
}
