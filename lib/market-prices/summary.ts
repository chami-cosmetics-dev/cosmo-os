import "server-only";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";
import { loadCatalogPricesForSkus } from "./catalog-prices";
import { FIXED_COMPETITORS } from "./competitors";
import {
  calculateCompetitorStats,
  calculateGapPct,
  isAboveMarket,
  isCheapestInMarket,
} from "./gap";
import { isPriceCheckStale } from "./stale";
import type {
  MarketCompareSummaryRow,
  MarketPriceCompetitorMeta,
  MarketPriceFilterKey,
  MarketPricePageMeta,
  MarketPriceSort,
  PriceLayer,
} from "./types";

export type BuildSummaryOptions = {
  layer?: PriceLayer;
  sort?: MarketPriceSort;
  filter?: MarketPriceFilterKey[];
  competitor?: string;
  brand?: string;
  priority?: string;
  q?: string;
  page?: number;
  limit?: number;
};

export type BuildSummaryResult = {
  meta: MarketPricePageMeta;
  rows: MarketCompareSummaryRow[];
};

export async function buildMarketCompareSummary(
  companyId: string,
  options: BuildSummaryOptions = {},
): Promise<BuildSummaryResult> {
  const layer = options.layer ?? "ogf";
  const sort = options.sort ?? "gap_desc";
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 50));
  const filters = options.filter ?? [];
  const competitorFilter = options.competitor?.trim().toLowerCase();
  const brandFilter = options.brand?.trim().toLowerCase();
  const priorityFilter = options.priority?.trim();
  const qFilter = options.q?.trim().toLowerCase();

  const isUntrackedOnly = filters.includes("untracked");

  // 1. Fetch links for active competitors
  const rawLinks = await prisma.marketCompetitorLink.findMany({
    where: {
      companyId,
      competitor: { active: true },
    },
    include: {
      competitor: {
        select: {
          slug: true,
          name: true,
          websiteDomain: true,
          sortOrder: true,
        },
      },
    },
  });

  // Group links by SKU
  const linksBySku = new Map<string, typeof rawLinks>();
  for (const link of rawLinks) {
    const s = link.sku.trim();
    const list = linksBySku.get(s) ?? [];
    list.push(link);
    linksBySku.set(s, list);
  }

  // 2. Identify target SKUs to load
  let targetSkus: string[] = [];

  if (isUntrackedOnly) {
    // Find all active catalog SKUs not in linksBySku
    const allItems = await prisma.productItem.findMany({
      where: {
        companyId,
        status: { not: "archived" },
        sku: { not: null },
      },
      select: { sku: true },
      take: 1000,
    });
    targetSkus = allItems
      .map((i) => i.sku?.trim() ?? "")
      .filter((s) => Boolean(s) && !linksBySku.has(s));
  } else {
    // Default v1 is linked SKUs
    targetSkus = Array.from(linksBySku.keys());

    // If search term provided and we have fewer linked results, also check matching catalog SKUs
    if (qFilter && targetSkus.length < 500) {
      const matchingItems = await prisma.productItem.findMany({
        where: {
          companyId,
          status: { not: "archived" },
          sku: { not: null },
          OR: [
            { sku: { contains: qFilter, mode: "insensitive" } },
            { productTitle: { contains: qFilter, mode: "insensitive" } },
            { barcode: { contains: qFilter, mode: "insensitive" } },
          ],
        },
        select: { sku: true },
        take: 100,
      });
      const extraSkus = matchingItems
        .map((i) => i.sku?.trim() ?? "")
        .filter(Boolean);
      targetSkus = Array.from(new Set([...targetSkus, ...extraSkus]));
    }
  }

  // 3. Filter by competitor slug if requested
  if (competitorFilter) {
    targetSkus = targetSkus.filter((sku) => {
      const links = linksBySku.get(sku) ?? [];
      return links.some((l) => l.competitor.slug.toLowerCase() === competitorFilter);
    });
  }

  // 4. Batch-load catalog metadata and prices
  const catalogMap = await loadCatalogPricesForSkus(companyId, targetSkus);

  // 5. Build summary rows
  let rows: MarketCompareSummaryRow[] = [];

  for (const sku of targetSkus) {
    const catalog = catalogMap.get(sku);
    const links = linksBySku.get(sku) ?? [];

    const prices = catalog?.prices ?? {
      mrp: null,
      promo: null,
      ogf: null,
      hasPromo: false,
    };

    const competitorPrices = links.map((l) => Number(l.listedPriceLkr));
    const stats = calculateCompetitorStats(competitorPrices);

    let anyStale = false;
    let latestCheckDate: string | null = null;

    for (const link of links) {
      if (link.checkDate) {
        const ymd = formatAppIsoDate(link.checkDate);
        if (isPriceCheckStale(ymd)) {
          anyStale = true;
        }
        if (!latestCheckDate || ymd > latestCheckDate) {
          latestCheckDate = ymd;
        }
      }
    }

    const gapPctMrp = calculateGapPct(prices.mrp, stats.median);
    const gapPctPromo = calculateGapPct(prices.promo, stats.median);
    const gapPctOgf = calculateGapPct(prices.ogf, stats.median);

    const cheapestMrp = isCheapestInMarket(prices.mrp, competitorPrices);
    const cheapestPromo = isCheapestInMarket(prices.promo, competitorPrices);
    const cheapestOgf = isCheapestInMarket(prices.ogf, competitorPrices);

    rows.push({
      sku,
      title: catalog?.title ?? null,
      brand: catalog?.brand ?? null,
      barcode: catalog?.barcode ?? null,
      priority: catalog?.priority ?? null,
      prices,
      competitorMin: stats.min,
      competitorMax: stats.max,
      competitorMedian: stats.median,
      competitorCount: stats.count,
      gapPctMrp,
      gapPctPromo,
      gapPctOgf,
      cheapestMrp,
      cheapestPromo,
      cheapestOgf,
      anyStale,
      latestCheckDate,
    });
  }

  // 6. Apply search and property filters
  if (qFilter) {
    rows = rows.filter((r) => {
      const matchSku = r.sku.toLowerCase().includes(qFilter);
      const matchTitle = r.title?.toLowerCase().includes(qFilter) ?? false;
      const matchBarcode = r.barcode?.toLowerCase().includes(qFilter) ?? false;
      const matchBrand = r.brand?.toLowerCase().includes(qFilter) ?? false;
      return matchSku || matchTitle || matchBarcode || matchBrand;
    });
  }

  if (brandFilter) {
    rows = rows.filter((r) => r.brand?.toLowerCase().includes(brandFilter));
  }

  if (priorityFilter && priorityFilter.toLowerCase() !== "all") {
    rows = rows.filter(
      (r) => (r.priority ?? "").toLowerCase() === priorityFilter.toLowerCase(),
    );
  }

  for (const f of filters) {
    if (f === "above_market") {
      rows = rows.filter((r) => {
        const gap =
          layer === "mrp" ? r.gapPctMrp : layer === "promo" ? r.gapPctPromo : r.gapPctOgf;
        return isAboveMarket(gap);
      });
    } else if (f === "cheapest") {
      rows = rows.filter((r) => {
        return layer === "mrp"
          ? r.cheapestMrp
          : layer === "promo"
            ? r.cheapestPromo
            : r.cheapestOgf;
      });
    } else if (f === "stale") {
      rows = rows.filter((r) => r.anyStale);
    } else if (f === "has_links") {
      rows = rows.filter((r) => r.competitorCount > 0);
    } else if (f === "untracked") {
      rows = rows.filter((r) => r.competitorCount === 0);
    }
  }

  // 7. Sort
  const getActiveGap = (r: MarketCompareSummaryRow): number | null => {
    return layer === "mrp" ? r.gapPctMrp : layer === "promo" ? r.gapPctPromo : r.gapPctOgf;
  };

  rows.sort((a, b) => {
    if (sort === "gap_desc") {
      const ga = getActiveGap(a);
      const gb = getActiveGap(b);
      if (ga == null && gb == null) return a.sku.localeCompare(b.sku);
      if (ga == null) return 1;
      if (gb == null) return -1;
      return gb - ga;
    }
    if (sort === "gap_asc") {
      const ga = getActiveGap(a);
      const gb = getActiveGap(b);
      if (ga == null && gb == null) return a.sku.localeCompare(b.sku);
      if (ga == null) return 1;
      if (gb == null) return -1;
      return ga - gb;
    }
    if (sort === "sku") {
      return a.sku.localeCompare(b.sku);
    }
    if (sort === "title") {
      return (a.title ?? "").localeCompare(b.title ?? "");
    }
    return 0;
  });

  const total = rows.length;
  const paginatedRows = rows.slice((page - 1) * limit, page * limit);

  const competitorsMeta: MarketPriceCompetitorMeta[] = FIXED_COMPETITORS.filter(
    (c) => c.active,
  ).map((c) => ({
    slug: c.slug,
    name: c.name,
    websiteDomain: c.websiteDomain,
  }));

  return {
    meta: {
      layer,
      competitors: competitorsMeta,
      page,
      limit,
      total,
    },
    rows: paginatedRows,
  };
}
