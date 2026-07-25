import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  fetchAllLwkItemPrices,
  resolveLwkErpInstance,
} from "@/lib/sticker-lwk-erp-price";

const UPDATE_CHUNK = 50;

export type OgfPriceSyncResult = {
  status: "ok" | "failed" | "not_configured";
  updated: number;
  priceCount: number;
  error: string | null;
};

/**
 * Pull Cosmo ERP "OGF Price List" (LWK POS) rates into ProductOsfProfile.ogfPrice.
 * Does not touch ProductItem.price (Shopify/online catalog stays independent).
 * On ERP failure: leaves existing ogfPrice values unchanged.
 */
export async function syncOgfPricesFromErp(
  companyId: string
): Promise<OgfPriceSyncResult> {
  const instance = await resolveLwkErpInstance(companyId);
  if (!instance) {
    return {
      status: "not_configured",
      updated: 0,
      priceCount: 0,
      error: "No Cosmo ERP instance linked for LWK",
    };
  }

  try {
    const prices = await fetchAllLwkItemPrices(instance.cfg);
    const entries = Object.entries(prices);
    if (entries.length === 0) {
      return { status: "ok", updated: 0, priceCount: 0, error: null };
    }

    const productSkus = await prisma.productItem.findMany({
      where: { companyId, sku: { not: null } },
      select: { sku: true },
      distinct: ["sku"],
    });
    const preferredSku = new Map<string, string>();
    for (const row of productSkus) {
      const sku = row.sku?.trim();
      if (!sku) continue;
      preferredSku.set(sku.toUpperCase(), sku);
    }

    let updated = 0;
    for (let i = 0; i < entries.length; i += UPDATE_CHUNK) {
      const chunk = entries.slice(i, i + UPDATE_CHUNK);
      await Promise.all(
        chunk.map(async ([erpSku, money]) => {
          const sku = preferredSku.get(erpSku.trim().toUpperCase()) ?? erpSku.trim();
          if (!sku) return;
          const n = Number(money);
          if (!Number.isFinite(n) || n <= 0) return;
          const decimal = new Prisma.Decimal(n.toFixed(2));
          await prisma.productOsfProfile.upsert({
            where: { companyId_sku: { companyId, sku } },
            create: { companyId, sku, ogfPrice: decimal },
            update: { ogfPrice: decimal },
          });
          updated += 1;
        })
      );
    }

    return { status: "ok", updated, priceCount: entries.length, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "OGF price sync failed";
    return {
      status: "failed",
      updated: 0,
      priceCount: 0,
      error: message.slice(0, 300),
    };
  }
}
