import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  loadGccStickerPricesBySku,
  resolveChamiErpInstance,
} from "@/lib/sticker-lwk-erp-price";

const UPDATE_CHUNK = 50;

export type GccPriceSyncResult = {
  status: "ok" | "failed" | "not_configured";
  updated: number;
  priceCount: number;
  error: string | null;
};

/**
 * Pull ERP "GCC PRICE LIST" (Chami shop) rates into ProductOsfProfile.gccPrice.
 * Does not touch ProductItem.price (online / Standard Selling stays independent).
 * On ERP failure: leaves existing gccPrice values unchanged.
 */
export async function syncGccPricesFromErp(
  companyId: string
): Promise<GccPriceSyncResult> {
  const instance = await resolveChamiErpInstance(companyId);
  if (!instance) {
    return {
      status: "not_configured",
      updated: 0,
      priceCount: 0,
      error: "No ERP instance linked for Chami location 005",
    };
  }

  try {
    const prices = await loadGccStickerPricesBySku(companyId);
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
            create: { companyId, sku, gccPrice: decimal },
            update: { gccPrice: decimal },
          });
          updated += 1;
        })
      );
    }

    return { status: "ok", updated, priceCount: entries.length, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "GCC price sync failed";
    return {
      status: "failed",
      updated: 0,
      priceCount: 0,
      error: message.slice(0, 300),
    };
  }
}
