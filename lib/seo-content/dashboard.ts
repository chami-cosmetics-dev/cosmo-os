import { prisma } from "@/lib/prisma";
import { getProductFamilyName } from "@/lib/product-item-family";
import {
  SALES_WINDOW_DAYS,
  SHORT_VIDEO_MAX_SECONDS,
  type SeoContentDashboardData,
  type SeoFamilyRow,
  type SeoUploadEvent,
} from "@/lib/seo-content/types";

const ACTIVITY_WINDOW_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

function isHiddenShopifyStatus(status: string | null) {
  const value = status?.trim().toLowerCase();
  return value === "draft" || value === "archived";
}

/**
 * Content coverage per product family (the unit Item Storage files are kept
 * under), plus who uploaded what. Families are ranked by units sold so the SEO
 * team can work through best-sellers first.
 */
export async function fetchSeoContentDashboardData(companyId: string): Promise<SeoContentDashboardData> {
  const salesSince = new Date(Date.now() - SALES_WINDOW_DAYS * DAY_MS);
  const activitySince = new Date(Date.now() - ACTIVITY_WINDOW_DAYS * DAY_MS);

  const [items, assets, explanations, sales] = await Promise.all([
    prisma.productItem.findMany({
      where: { companyId },
      select: {
        id: true,
        productTitle: true,
        sku: true,
        shopifyProductId: true,
        imageUrl: true,
        status: true,
        vendor: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
    prisma.productItemAsset.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
      select: {
        sku: true,
        type: true,
        blobUrl: true,
        durationSeconds: true,
        createdAt: true,
        uploadedBy: { select: { name: true, email: true } },
      },
    }),
    prisma.cosmoAcademyExplanation.findMany({
      where: { companyId },
      select: {
        productKey: true,
        createdAt: true,
        createdBy: { select: { name: true, email: true } },
        media: { select: { url: true } },
      },
    }),
    prisma.$queryRaw<Array<{ productItemId: string; units: bigint }>>`
      SELECT oli."productItemId", SUM(oli."quantity")::bigint AS units
      FROM "OrderLineItem" oli
      JOIN "Order" o ON o."id" = oli."orderId"
      WHERE o."companyId" = ${companyId}
        AND o."createdAt" >= ${salesSince}
        AND o."cancelledAt" IS NULL
      GROUP BY oli."productItemId"
    `,
  ]);

  const families = new Map<string, SeoFamilyRow>();
  /** Storage URLs already counted per family (rows repeat per SKU). */
  const seenUrls = new Map<string, Set<string>>();
  const familyByItemId = new Map<string, string>();
  const familyBySku = new Map<string, string>();
  const familyByProductKey = new Map<string, string>();
  const skusByFamily = new Map<string, Set<string>>();

  for (const item of items) {
    const name = getProductFamilyName(item.productTitle);
    let family = families.get(name);
    if (!family) {
      family = {
        family: name,
        sampleTitle: item.productTitle,
        sampleSku: item.sku,
        imageUrl: item.imageUrl,
        vendor: item.vendor?.name ?? null,
        category: item.category?.name ?? null,
        live: false,
        skuCount: 0,
        unitsSold: 0,
        photos: 0,
        shortVideos: 0,
        longVideos: 0,
        unknownLengthVideos: 0,
        videoSeconds: 0,
        audio: 0,
        documents: 0,
        voiceExplanations: 0,
        lastUploadAt: null,
      };
      families.set(name, family);
    }
    if (!family.imageUrl && item.imageUrl) family.imageUrl = item.imageUrl;
    if (!family.sampleSku && item.sku) {
      family.sampleSku = item.sku;
      family.sampleTitle = item.productTitle;
    }
    family.vendor ??= item.vendor?.name ?? null;
    family.category ??= item.category?.name ?? null;
    if (!isHiddenShopifyStatus(item.status)) family.live = true;

    familyByItemId.set(item.id, name);
    familyByProductKey.set(item.shopifyProductId || item.id, name);
    if (item.sku) {
      if (!familyBySku.has(item.sku)) familyBySku.set(item.sku, name);
      const skus = skusByFamily.get(name) ?? new Set<string>();
      skus.add(item.sku);
      skusByFamily.set(name, skus);
    }
  }

  for (const [name, skus] of skusByFamily) {
    families.get(name)!.skuCount = skus.size;
  }

  for (const row of sales) {
    const name = familyByItemId.get(row.productItemId);
    if (name) families.get(name)!.unitsSold += Number(row.units);
  }

  const uploads: SeoUploadEvent[] = [];
  const touch = (family: SeoFamilyRow, at: Date) => {
    const iso = at.toISOString();
    if (!family.lastUploadAt || iso > family.lastUploadAt) family.lastUploadAt = iso;
  };

  // Academy voices first: their storage copies must not count again as audio uploads.
  const academyUrls = new Set<string>();
  for (const explanation of explanations) {
    for (const media of explanation.media) academyUrls.add(media.url);
    const name = familyByProductKey.get(explanation.productKey);
    if (!name || explanation.media.length === 0) continue;
    const family = families.get(name)!;
    family.voiceExplanations += 1;
    touch(family, explanation.createdAt);
    if (explanation.createdAt >= activitySince) {
      uploads.push({
        at: explanation.createdAt.toISOString(),
        person: explanation.createdBy?.name || explanation.createdBy?.email || "Unknown",
        kind: "voice",
      });
    }
  }

  // Storage rows are duplicated per SKU in the family; count each file once.
  for (const asset of assets) {
    const name = familyBySku.get(asset.sku);
    if (!name) continue;
    const family = families.get(name)!;
    const seen = seenUrls.get(name) ?? new Set<string>();
    if (seen.has(asset.blobUrl)) continue;
    seen.add(asset.blobUrl);
    seenUrls.set(name, seen);
    if (academyUrls.has(asset.blobUrl)) continue;

    touch(family, asset.createdAt);
    if (asset.type === "image") family.photos += 1;
    else if (asset.type === "audio") family.audio += 1;
    else if (asset.type === "document") family.documents += 1;
    else if (asset.type === "video") {
      if (asset.durationSeconds == null) family.unknownLengthVideos += 1;
      else {
        family.videoSeconds += asset.durationSeconds;
        if (asset.durationSeconds <= SHORT_VIDEO_MAX_SECONDS) family.shortVideos += 1;
        else family.longVideos += 1;
      }
    }

    if (asset.createdAt >= activitySince) {
      uploads.push({
        at: asset.createdAt.toISOString(),
        person: asset.uploadedBy?.name || asset.uploadedBy?.email || "Unknown",
        kind:
          asset.type === "image"
            ? "photo"
            : asset.type === "video"
              ? "video"
              : asset.type === "audio"
                ? "audio"
                : "document",
      });
    }
  }

  const rows: SeoFamilyRow[] = [...families.values()]
    .filter((family) => family.family !== "Unassigned")
    .sort((a, b) => b.unitsSold - a.unitsSold || a.family.localeCompare(b.family));

  return {
    generatedAt: new Date().toISOString(),
    families: rows,
    uploads,
  };
}
