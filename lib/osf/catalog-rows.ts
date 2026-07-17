import "server-only";

import type { Prisma } from "@prisma/client";

import { PRODUCT_ITEM_STATUS_META } from "@/lib/product-item-status";
import { prisma } from "@/lib/prisma";

export type OsfCatalogRow = {
  sku: string;
  productTitle: string;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  siteStatus: string | null;
  itemStatusLabel: string | null;
  itemStatusCategory: string;
  mrp: number | null;
  discountedPrice: number | null;
  vendorId: string | null;
};

export type CatalogFilters = {
  includeInactive?: boolean;
  vendorIds?: string[];
  itemStatusCategories?: string[];
  skuPrefix?: string;
};

/**
 * One row per distinct company SKU (prefer most recently updated ProductItem).
 */
export async function buildCatalogRows(
  companyId: string,
  filters: CatalogFilters = {},
): Promise<OsfCatalogRow[]> {
  const where: Prisma.ProductItemWhereInput = {
    companyId,
    sku: { not: null },
  };

  if (!filters.includeInactive) {
    where.status = { not: "archived" };
  }
  if (filters.vendorIds?.length) {
    where.vendorId = { in: filters.vendorIds };
  }
  if (filters.itemStatusCategories?.length) {
    where.itemStatusCategory = { in: filters.itemStatusCategories };
  }
  if (filters.skuPrefix?.trim()) {
    where.sku = { startsWith: filters.skuPrefix.trim(), mode: "insensitive" };
  }

  const items = await prisma.productItem.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      sku: true,
      productTitle: true,
      variantTitle: true,
      barcode: true,
      imageUrl: true,
      status: true,
      itemStatusCategory: true,
      itemStatusLabel: true,
      price: true,
      compareAtPrice: true,
      vendorId: true,
      vendor: { select: { name: true } },
    },
  });

  const bySku = new Map<string, OsfCatalogRow>();
  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku || bySku.has(sku)) continue;
    const title =
      item.variantTitle && item.variantTitle !== "Default Title"
        ? `${item.productTitle} - ${item.variantTitle}`
        : item.productTitle;
    const mrp =
      item.compareAtPrice != null ? Number(item.compareAtPrice) : null;
    const discounted = item.price != null ? Number(item.price) : null;
    const statusMeta = PRODUCT_ITEM_STATUS_META[
      item.itemStatusCategory as keyof typeof PRODUCT_ITEM_STATUS_META
    ];
    bySku.set(sku, {
      sku,
      productTitle: title,
      brand: item.vendor?.name ?? null,
      barcode: item.barcode?.trim() || null,
      imageUrl: item.imageUrl?.trim() || null,
      siteStatus: item.status?.trim() || null,
      itemStatusLabel: item.itemStatusLabel?.trim() || statusMeta?.label || null,
      itemStatusCategory: item.itemStatusCategory,
      mrp: mrp != null && Number.isFinite(mrp) ? mrp : null,
      discountedPrice: discounted != null && Number.isFinite(discounted) ? discounted : null,
      vendorId: item.vendorId,
    });
  }

  return [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}
