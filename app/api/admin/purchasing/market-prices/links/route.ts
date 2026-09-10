import { NextRequest, NextResponse } from "next/server";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { loadCatalogPricesForSkus } from "@/lib/market-prices/catalog-prices";
import { FIXED_COMPETITORS, validateCompetitorProductUrl } from "@/lib/market-prices/competitors";
import { calculateSingleCompetitorGaps } from "@/lib/market-prices/gap";
import { checkPackSizeMismatch, parsePackSize } from "@/lib/market-prices/pack-size";
import { isPriceCheckStale } from "@/lib/market-prices/stale";
import type {
  CompetitorPriceSlot,
  MarketSkuDetailResponse,
  PriceHistoryEntry,
} from "@/lib/market-prices/types";
import { prisma } from "@/lib/prisma";
import { getCurrentUserContext, requirePermission } from "@/lib/rbac";
import {
  marketPriceLinkCreateSchema,
  marketPriceLinksQuerySchema,
} from "@/lib/validation/market-prices";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePermission("purchasing.market_prices.read");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const raw = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = marketPriceLinksQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { sku, competitor: competitorSlugFilter } = parsed.data;

  // 1. Fetch catalog metadata
  const catalogMap = await loadCatalogPricesForSkus(companyId, [sku]);
  const catalog = catalogMap.get(sku);
  if (!catalog) {
    return NextResponse.json({ error: `SKU ${sku} not found` }, { status: 404 });
  }

  // 2. Fetch all competitor records from DB or seed
  const dbCompetitors = await prisma.marketCompetitor.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  // 3. Fetch existing links for this SKU
  const existingLinks = await prisma.marketCompetitorLink.findMany({
    where: {
      companyId,
      sku,
    },
    include: {
      competitor: true,
      history: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  const linkByCompetitorSlug = new Map<string, (typeof existingLinks)[number]>();
  for (const link of existingLinks) {
    linkByCompetitorSlug.set(link.competitor.slug.toLowerCase(), link);
  }

  // 4. Build competitor slots (all 6 seed competitors)
  const slots: CompetitorPriceSlot[] = [];
  const allHistory: PriceHistoryEntry[] = [];

  const targetCompetitors = competitorSlugFilter
    ? dbCompetitors.filter((c) => c.slug.toLowerCase() === competitorSlugFilter.toLowerCase())
    : dbCompetitors;

  for (const comp of targetCompetitors) {
    const link = linkByCompetitorSlug.get(comp.slug.toLowerCase());

    if (link) {
      const priceLkr = Number(link.listedPriceLkr);
      const checkDateYmd = link.checkDate ? formatAppIsoDate(link.checkDate) : null;
      const stale = isPriceCheckStale(checkDateYmd);
      const gaps = calculateSingleCompetitorGaps(catalog.prices, priceLkr);

      slots.push({
        competitorSlug: comp.slug,
        competitorName: comp.name,
        linked: true,
        linkId: link.id,
        productUrl: link.productUrl,
        competitorTitle: link.competitorTitle,
        listedPriceLkr: priceLkr,
        inStock: link.inStock,
        checkDate: checkDateYmd,
        stale,
        notes: link.notes,
        gaps,
      });

      // Collect price history
      for (const h of link.history) {
        allHistory.push({
          id: h.id,
          linkId: h.linkId,
          listedPriceLkr: Number(h.listedPriceLkr),
          inStock: h.inStock,
          checkDate: formatAppIsoDate(h.checkDate),
          changedAt: h.createdAt.toISOString(),
        });
      }
    } else {
      slots.push({
        competitorSlug: comp.slug,
        competitorName: comp.name,
        linked: false,
        linkId: null,
        productUrl: null,
        competitorTitle: null,
        listedPriceLkr: null,
        inStock: null,
        checkDate: null,
        stale: false,
        notes: null,
        gaps: { mrp: null, promo: null, ogf: null },
      });
    }
  }

  // Sort history newest first
  allHistory.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());

  const response: MarketSkuDetailResponse = {
    sku,
    title: catalog.title,
    brand: catalog.brand,
    barcode: catalog.barcode,
    priority: catalog.priority,
    prices: catalog.prices,
    competitors: slots,
    history: allHistory,
  };

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission("purchasing.market_prices.manage");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const context = await getCurrentUserContext();
  const companyId = context?.user?.companyId;
  const userId = context?.user?.id;
  if (!companyId) {
    return NextResponse.json(
      { error: "No company associated with your account" },
      { status: 404 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = marketPriceLinkCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // 1. Verify SKU exists in company catalog
  const catalogItem = await prisma.productItem.findFirst({
    where: {
      companyId,
      sku: data.sku,
      status: { not: "archived" },
    },
    select: { id: true, sku: true, productTitle: true },
  });

  if (!catalogItem) {
    return NextResponse.json(
      { error: `SKU ${data.sku} does not exist in catalog` },
      { status: 404 },
    );
  }

  // 2. Verify Competitor exists
  let competitor = await prisma.marketCompetitor.findUnique({
    where: { slug: data.competitorSlug },
  });

  if (!competitor) {
    const fixed = FIXED_COMPETITORS.find((c) => c.slug === data.competitorSlug);
    if (fixed) {
      competitor = await prisma.marketCompetitor.create({
        data: {
          slug: fixed.slug,
          name: fixed.name,
          websiteDomain: fixed.websiteDomain,
          sortOrder: fixed.sortOrder,
          active: fixed.active,
        },
      });
    } else {
      return NextResponse.json(
        { error: `Unknown competitor: ${data.competitorSlug}` },
        { status: 400 },
      );
    }
  }

  // 3. Validate URL domain
  const urlCheck = validateCompetitorProductUrl(data.productUrl, competitor.websiteDomain);
  if (!urlCheck.valid) {
    return NextResponse.json({ error: urlCheck.warning || "Invalid URL" }, { status: 400 });
  }

  // 4. Pack size mismatch check (unless overridden)
  if (!data.sizeMismatchConfirmed) {
    const sizeCheck = checkPackSizeMismatch(catalogItem.productTitle, data.competitorTitle);
    if (sizeCheck.mismatch) {
      return NextResponse.json(
        {
          code: "PACK_SIZE_MISMATCH",
          error: sizeCheck.warning,
          ourSize: sizeCheck.ourSize,
          competitorSize: sizeCheck.competitorSize,
        },
        { status: 409 },
      );
    }
  }

  const parsedPack = data.packSizeNormalized || parsePackSize(data.competitorTitle)?.normalized || null;
  const checkDateParsed = new Date(`${data.checkDate}T00:00:00Z`);

  // 5. Upsert link & record price history
  const existing = await prisma.marketCompetitorLink.findUnique({
    where: {
      companyId_sku_competitorId: {
        companyId,
        sku: data.sku,
        competitorId: competitor.id,
      },
    },
  });

  if (existing) {
    const oldPrice = Number(existing.listedPriceLkr);
    const newPrice = Number(data.listedPriceLkr);

    // If price changed, create audit history row
    if (oldPrice !== newPrice) {
      await prisma.marketCompetitorPriceHistory.create({
        data: {
          linkId: existing.id,
          listedPriceLkr: existing.listedPriceLkr,
          inStock: existing.inStock,
          checkDate: existing.checkDate,
          changedById: userId,
        },
      });
    }

    const updated = await prisma.marketCompetitorLink.update({
      where: { id: existing.id },
      data: {
        productUrl: data.productUrl,
        competitorTitle: data.competitorTitle,
        packSizeNormalized: parsedPack,
        listedPriceLkr: data.listedPriceLkr,
        inStock: data.inStock,
        checkDate: checkDateParsed,
        notes: data.notes ?? null,
        updatedById: userId,
      },
    });

    return NextResponse.json(updated, { status: 200 });
  }

  const created = await prisma.marketCompetitorLink.create({
    data: {
      companyId,
      sku: data.sku,
      competitorId: competitor.id,
      productUrl: data.productUrl,
      competitorTitle: data.competitorTitle,
      packSizeNormalized: parsedPack,
      listedPriceLkr: data.listedPriceLkr,
      inStock: data.inStock,
      checkDate: checkDateParsed,
      notes: data.notes ?? null,
      createdById: userId,
    },
  });

  return NextResponse.json(created, { status: 201 });
}
