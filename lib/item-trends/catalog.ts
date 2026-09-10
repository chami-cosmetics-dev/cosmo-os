import "server-only";

import { prisma } from "@/lib/prisma";

import { commonSkuKeyFor } from "@/lib/item-trends/sku-group";

export type SkuCatalogEntry = {
  sku: string;
  title: string | null;
  variantTitle: string | null;
  commonSkuKey: string;
  commonSkuTitle: string;
  brand: string | null;
  erp1ProductPriority: string | null;
  erp2ProductPriority: string | null;
};

export async function loadSkuCatalog(companyId: string): Promise<Map<string, SkuCatalogEntry>> {
  const items = await prisma.productItem.findMany({
    where: { companyId, sku: { not: null }, status: { not: "archived" } },
    select: {
      sku: true,
      productTitle: true,
      variantTitle: true,
      shopifyProductId: true,
      erp1ProductPriority: true,
      erp2ProductPriority: true,
      vendor: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const map = new Map<string, SkuCatalogEntry>();
  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku || map.has(sku)) continue;
    map.set(sku, {
      sku,
      title: item.productTitle,
      variantTitle: item.variantTitle,
      commonSkuKey: commonSkuKeyFor({ sku, shopifyProductId: item.shopifyProductId }),
      commonSkuTitle: item.productTitle,
      brand: item.vendor?.name ?? null,
      erp1ProductPriority: item.erp1ProductPriority,
      erp2ProductPriority: item.erp2ProductPriority,
    });
  }
  return map;
}

export function applyCatalogToMovement<
  T extends {
    sku: string;
    title: string | null;
    priority: string;
  },
>(
  row: T,
  catalog: Map<string, SkuCatalogEntry>,
): T & {
  brand: string | null;
  commonSkuKey: string;
  commonSkuTitle: string | null;
  variantTitle: string | null;
} {
  const meta = catalog.get(row.sku);
  return {
    ...row,
    title: meta?.title ?? row.title,
    brand: meta?.brand ?? null,
    commonSkuKey: meta?.commonSkuKey ?? row.sku,
    commonSkuTitle: meta?.commonSkuTitle ?? row.title,
    variantTitle: meta?.variantTitle ?? null,
  };
}
