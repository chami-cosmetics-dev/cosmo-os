import "server-only";

import type { Prisma } from "@prisma/client";

import {
  buildOsfCatalogRowsFromItems,
  type OsfCatalogRow,
} from "@/lib/osf/catalog-row-build";
import { prisma } from "@/lib/prisma";

export type { OsfCatalogRow };

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
 * Bundle packs are omitted. Site Status prefers Shopify active over draft.
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
      productType: true,
      itemStatusCategory: true,
      itemStatusLabel: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
      erp1TaxStatus: true,
      erp2TaxStatus: true,
      price: true,
      compareAtPrice: true,
      vendorId: true,
      vendor: { select: { name: true } },
    },
  });

  return buildOsfCatalogRowsFromItems(items);
}
