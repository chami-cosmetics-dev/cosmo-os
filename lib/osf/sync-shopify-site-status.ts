import "server-only";

import { prisma } from "@/lib/prisma";
import { pickShopifyStoreHandle } from "@/lib/osf/shopify-catalog-prices";
import {
  parseStorefrontProductHandles,
  storefrontOriginFromLocation,
} from "@/lib/osf/sync-shopify-site-status-parse";
import { normalizeShopifyStoreHandle } from "@/lib/shopify-admin";

const SITEMAP_TIMEOUT_MS = 20_000;

export { parseStorefrontProductHandles, storefrontOriginFromLocation };

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "application/xml,text/xml,*/*" },
    cache: "no-store",
    signal: AbortSignal.timeout(SITEMAP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Storefront GET ${url} [${res.status}]`);
  return res.text();
}

async function loadLiveProductHandles(origin: string): Promise<Set<string>> {
  const indexXml = await fetchText(`${origin}/sitemap.xml`);
  const locRe = /<loc>([^<]*sitemap_products_[^<]+)<\/loc>/gi;
  const productSitemaps: string[] = [];
  let locMatch: RegExpExecArray | null;
  while ((locMatch = locRe.exec(indexXml))) {
    productSitemaps.push(locMatch[1].replaceAll("&amp;", "&"));
  }
  if (productSitemaps.length === 0) {
    throw new Error(`No product sitemaps at ${origin}/sitemap.xml`);
  }
  const handles = new Set<string>();
  for (const url of productSitemaps) {
    const xml = await fetchText(url);
    for (const handle of parseStorefrontProductHandles(xml, origin)) {
      handles.add(handle);
    }
  }
  return handles;
}

export type ShopifySiteStatusSyncResult = {
  origin: string | null;
  liveHandles: number;
  updated: number;
  skipped: string | null;
};

/**
 * Cosmo Site Status lags when Shopify product/update is missed.
 * Live storefront sitemap = published (Active). Promote matching drafts to active.
 * Does not demote Cosmo active rows.
 */
export async function syncShopifySiteStatusFromStorefront(
  companyId: string,
): Promise<ShopifySiteStatusSyncResult> {
  const locations = await prisma.companyLocation.findMany({
    where: { companyId },
    select: {
      shopifyAdminStoreHandle: true,
      shopifyShopName: true,
      name: true,
      isMainCompany: true,
      locationReference: true,
    },
  });
  const handle = pickShopifyStoreHandle(locations);
  const picked =
    locations.find(
      (loc) => normalizeShopifyStoreHandle(loc.shopifyAdminStoreHandle ?? "") === handle,
    ) ?? locations.find((loc) => loc.isMainCompany) ?? locations[0];
  const origin = picked ? storefrontOriginFromLocation(picked) : null;
  if (!origin) {
    return { origin: null, liveHandles: 0, updated: 0, skipped: "no_storefront_origin" };
  }

  const liveHandles = await loadLiveProductHandles(origin);
  if (liveHandles.size === 0) {
    return { origin, liveHandles: 0, updated: 0, skipped: "empty_sitemap" };
  }

  const drafts = await prisma.productItem.findMany({
    where: {
      companyId,
      status: { equals: "draft", mode: "insensitive" },
      handle: { not: null },
    },
    select: { id: true, handle: true },
  });
  const ids = drafts
    .filter((row) => liveHandles.has((row.handle ?? "").trim().toLowerCase()))
    .map((row) => row.id);
  if (ids.length === 0) {
    return { origin, liveHandles: liveHandles.size, updated: 0, skipped: null };
  }

  const result = await prisma.productItem.updateMany({
    where: { id: { in: ids } },
    data: { status: "active" },
  });
  return { origin, liveHandles: liveHandles.size, updated: result.count, skipped: null };
}
