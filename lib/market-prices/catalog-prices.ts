import "server-only";

import { resolveEffectivePriority } from "@/lib/item-trends/aggregate";
import { prisma } from "@/lib/prisma";
import type { PriceLayerSnapshot } from "./types";

export type CatalogSkuMetadata = {
  sku: string;
  title: string | null;
  brand: string | null;
  barcode: string | null;
  priority: string;
  prices: PriceLayerSnapshot;
};

export function derivePriceLayerSnapshot(input: {
  compareAtPrice: number | null | undefined;
  price: number | null | undefined;
  ogfPrice: number | null | undefined;
}): PriceLayerSnapshot {
  const mrp =
    input.compareAtPrice != null && Number.isFinite(input.compareAtPrice) && input.compareAtPrice > 0
      ? Number(input.compareAtPrice)
      : null;

  const catalogPrice =
    input.price != null && Number.isFinite(input.price) && input.price > 0
      ? Number(input.price)
      : null;

  // Active promo requires both MRP and price set, and promo price strictly lower than MRP
  const hasPromo = Boolean(mrp != null && catalogPrice != null && catalogPrice < mrp);
  const promo = hasPromo ? catalogPrice : null;

  const ogf =
    input.ogfPrice != null && Number.isFinite(input.ogfPrice) && input.ogfPrice > 0
      ? Number(input.ogfPrice)
      : null;

  return {
    mrp,
    promo,
    ogf,
    hasPromo,
  };
}

export async function loadCatalogPricesForSkus(
  companyId: string,
  skus: string[],
): Promise<Map<string, CatalogSkuMetadata>> {
  const result = new Map<string, CatalogSkuMetadata>();
  const cleanSkus = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (cleanSkus.length === 0) return result;

  const [items, profiles] = await Promise.all([
    prisma.productItem.findMany({
      where: {
        companyId,
        sku: { in: cleanSkus },
        status: { not: "archived" },
      },
      select: {
        sku: true,
        productTitle: true,
        barcode: true,
        compareAtPrice: true,
        price: true,
        erp1ProductPriority: true,
        erp2ProductPriority: true,
        vendor: { select: { name: true } },
      },
    }),
    prisma.productOsfProfile.findMany({
      where: {
        companyId,
        sku: { in: cleanSkus },
      },
      select: {
        sku: true,
        ogfPrice: true,
      },
    }),
  ]);

  const profileMap = new Map<string, number | null>();
  for (const prof of profiles) {
    profileMap.set(
      prof.sku.trim(),
      prof.ogfPrice != null ? Number(prof.ogfPrice) : null,
    );
  }

  for (const item of items) {
    const sku = item.sku?.trim();
    if (!sku) continue;

    const prices = derivePriceLayerSnapshot({
      compareAtPrice: item.compareAtPrice != null ? Number(item.compareAtPrice) : null,
      price: item.price != null ? Number(item.price) : null,
      ogfPrice: profileMap.get(sku) ?? null,
    });

    const priority = resolveEffectivePriority(
      item.erp1ProductPriority,
      item.erp2ProductPriority,
    );

    result.set(sku, {
      sku,
      title: item.productTitle ?? null,
      brand: item.vendor?.name?.trim() || null,
      barcode: item.barcode?.trim() || null,
      priority,
      prices,
    });
  }

  return result;
}
