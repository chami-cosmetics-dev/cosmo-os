import { isBundleCatalogItem } from "@/lib/catalog-bundle";

export type OsfCatalogRow = {
  sku: string;
  productTitle: string;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  siteStatus: string | null;
  productType?: string | null;
  /** @deprecated Prefer erp1/erp2 — kept for workbook compatibility */
  itemStatusLabel: string | null;
  itemStatusCategory: string;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
  /** ERP Item Manufacturing Tax Status (`Vat` / `Non Vat` / `Vat / Non Vat`). */
  erp1TaxStatus: string | null;
  erp2TaxStatus: string | null;
  /** ERP Item.country_of_origin. */
  country: string | null;
  mrp: number | null;
  discountedPrice: number | null;
  vendorId: string | null;
};

export type OsfCatalogItemSource = {
  sku: string | null;
  productTitle: string;
  variantTitle?: string | null;
  barcode: string | null;
  imageUrl: string | null;
  status: string | null;
  productType?: string | null;
  itemStatusCategory: string;
  itemStatusLabel: string | null;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
  erp1TaxStatus: string | null;
  erp2TaxStatus: string | null;
  price: { toNumber?: () => number } | number | null;
  compareAtPrice: { toNumber?: () => number } | number | null;
  vendorId: string | null;
  vendor?: { name: string } | null;
};

/** Shopify product status. Higher rank wins when one SKU has several Cosmo rows. */
export function shopifySiteStatusRank(status: string | null | undefined): number {
  const key = (status ?? "").trim().toLowerCase();
  if (key === "active") return 3;
  if (key === "unlisted") return 2;
  if (key === "draft") return 1;
  return 0;
}

function money(value: OsfCatalogItemSource["price"]): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value.toNumber?.() ?? value);
  return Number.isFinite(n) ? n : null;
}

function toCatalogRow(item: OsfCatalogItemSource, sku: string): OsfCatalogRow {
  const title =
    item.variantTitle && item.variantTitle !== "Default Title"
      ? `${item.productTitle} - ${item.variantTitle}`
      : item.productTitle;
  const mrp = money(item.compareAtPrice);
  const discounted = money(item.price);
  const erp1 = item.erp1ProductPriority?.trim() || null;
  const erp2 = item.erp2ProductPriority?.trim() || null;
  const combined = erp1 && erp2 && erp1 !== erp2 ? `${erp1} / ${erp2}` : erp1 || erp2 || null;
  return {
    sku,
    productTitle: title,
    brand: item.vendor?.name ?? null,
    barcode: item.barcode?.trim() || null,
    imageUrl: item.imageUrl?.trim() || null,
    siteStatus: item.status?.trim() || null,
    productType: item.productType?.trim() || null,
    itemStatusLabel: combined,
    itemStatusCategory: item.itemStatusCategory,
    erp1ProductPriority: erp1,
    erp2ProductPriority: erp2,
    erp1TaxStatus: item.erp1TaxStatus?.trim() || null,
    erp2TaxStatus: item.erp2TaxStatus?.trim() || null,
    country: null,
    mrp,
    discountedPrice: discounted,
    vendorId: item.vendorId,
  };
}

/**
 * One OSF row per SKU. Bundle packs are dropped. If the same SKU has both
 * draft and active Cosmo rows, Site Status is active.
 */
export function buildOsfCatalogRowsFromItems(items: OsfCatalogItemSource[]): OsfCatalogRow[] {
  const bySku = new Map<string, OsfCatalogRow>();
  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku) continue;
    if (
      isBundleCatalogItem({
        sku,
        productTitle: item.productTitle,
        productType: item.productType,
      })
    ) {
      continue;
    }
    const row = toCatalogRow(item, sku);
    const existing = bySku.get(sku);
    if (!existing) {
      bySku.set(sku, row);
      continue;
    }
    if (shopifySiteStatusRank(row.siteStatus) > shopifySiteStatusRank(existing.siteStatus)) {
      existing.siteStatus = row.siteStatus;
    }
  }
  return [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}
