import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type OsfCatalogRow = {
  sku: string;
  productTitle: string;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  siteStatus: string | null;
  /** @deprecated Prefer erp1/erp2 — kept for workbook compatibility */
  itemStatusLabel: string | null;
  itemStatusCategory: string;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
  mrp: number | null;
  discountedPrice: number | null;
  vendorId: string | null;
};

export type CatalogFilters = {
  includeInactive?: boolean;
  vendorIds?: string[];
  /** Exact ERP Product Priority values (match ERP1 or ERP2) */
  itemStatusCategories?: string[];
  erpProductPriorities?: string[];
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

  const priorities =
    filters.erpProductPriorities?.length
      ? filters.erpProductPriorities
      : filters.itemStatusCategories?.length
        ? filters.itemStatusCategories
        : null;
  if (priorities?.length) {
    where.OR = [
      { erp1ProductPriority: { in: priorities } },
      { erp2ProductPriority: { in: priorities } },
    ];
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
      erp1ProductPriority: true,
      erp2ProductPriority: true,
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
    const mrp = item.compareAtPrice != null ? Number(item.compareAtPrice) : null;
    const discounted = item.price != null ? Number(item.price) : null;
    const erp1 = item.erp1ProductPriority?.trim() || null;
    const erp2 = item.erp2ProductPriority?.trim() || null;
    const combined =
      erp1 && erp2 && erp1 !== erp2 ? `${erp1} / ${erp2}` : erp1 || erp2 || null;
    bySku.set(sku, {
      sku,
      productTitle: title,
      brand: item.vendor?.name ?? null,
      barcode: item.barcode?.trim() || null,
      imageUrl: item.imageUrl?.trim() || null,
      siteStatus: item.status?.trim() || null,
      itemStatusLabel: combined,
      itemStatusCategory: item.itemStatusCategory,
      erp1ProductPriority: erp1,
      erp2ProductPriority: erp2,
      mrp: mrp != null && Number.isFinite(mrp) ? mrp : null,
      discountedPrice: discounted != null && Number.isFinite(discounted) ? discounted : null,
      vendorId: item.vendorId,
    });
  }

  return [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));
}
