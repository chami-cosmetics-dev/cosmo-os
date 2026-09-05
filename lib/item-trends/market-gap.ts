import "server-only";

import { calculateCompetitorStats, calculateGapPct, isCheapestInMarket } from "@/lib/market-prices/gap";
import { prisma } from "@/lib/prisma";

export { resolveMarketGapBadge, type MarketGapBadge } from "./market-gap-badge";

/**
 * Batch-loads competitor market gaps against OGF price for a list of SKUs.
 */
export async function fetchMarketGapForSkus(
  companyId: string,
  skus: string[],
): Promise<Map<string, { gapPct: number | null; isCheapest: boolean }>> {
  const result = new Map<string, { gapPct: number | null; isCheapest: boolean }>();
  const cleanSkus = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  if (cleanSkus.length === 0) return result;

  const [links, profiles] = await Promise.all([
    prisma.marketCompetitorLink.findMany({
      where: {
        companyId,
        sku: { in: cleanSkus },
        competitor: { active: true },
      },
      select: {
        sku: true,
        listedPriceLkr: true,
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

  const linksBySku = new Map<string, number[]>();
  for (const l of links) {
    const s = l.sku.trim();
    const list = linksBySku.get(s) ?? [];
    list.push(Number(l.listedPriceLkr));
    linksBySku.set(s, list);
  }

  const ogfBySku = new Map<string, number | null>();
  for (const p of profiles) {
    ogfBySku.set(p.sku.trim(), p.ogfPrice != null ? Number(p.ogfPrice) : null);
  }

  for (const sku of cleanSkus) {
    const compPrices = linksBySku.get(sku);
    if (!compPrices || compPrices.length === 0) continue;

    const stats = calculateCompetitorStats(compPrices);
    const ourPrice = ogfBySku.get(sku);

    const gapPct = calculateGapPct(ourPrice, stats.median);
    const isCheapest = isCheapestInMarket(ourPrice, compPrices);

    result.set(sku, { gapPct, isCheapest });
  }

  return result;
}
