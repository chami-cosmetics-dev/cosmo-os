import "server-only";

import { Prisma } from "@prisma/client";

import { pickCosmoCatalogErpInstance } from "@/lib/cosmo-catalog-erp";
import { planStandardSellingPriceUpdates } from "@/lib/erp-item-price-decision";
import {
  getAllOsfErpInstances,
  OsfErpError,
  type OsfErpCredentials,
  type OsfErpInstance,
} from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";

export {
  LWK_STICKER_PRICE_LIST,
  STANDARD_SELLING_PRICE_LIST,
} from "@/lib/sticker-lwk-erp-price-list";

import {
  LWK_STICKER_PRICE_LIST,
  STANDARD_SELLING_PRICE_LIST,
} from "@/lib/sticker-lwk-erp-price-list";

const PAGE_LENGTH = 500;
const MAX_PAGES = 80;
const ITEM_BATCH = 100;
const UPDATE_CHUNK = 200;

function authHeaders(cfg: OsfErpCredentials): Record<string, string> {
  return {
    Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
    Accept: "application/json",
  };
}

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: authHeaders(cfg),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function toMoneyString(rate: number | null | undefined): string | null {
  if (rate == null) return null;
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

/**
 * Prefer the ERP instance linked to the LWK location; else Cosmetics/Cosmo by label or URL.
 */
export async function resolveLwkErpInstance(
  companyId: string
): Promise<OsfErpInstance | null> {
  const lwkLocation = await prisma.companyLocation.findFirst({
    where: {
      companyId,
      OR: [
        { locationReference: { equals: "LWK", mode: "insensitive" } },
        { name: { contains: "LWK", mode: "insensitive" } },
      ],
    },
    select: {
      erpnextInstance: {
        select: {
          id: true,
          label: true,
          baseUrl: true,
          apiKey: true,
          apiSecret: true,
        },
      },
    },
  });

  const linked = lwkLocation?.erpnextInstance;
  if (linked?.baseUrl && linked.apiKey && linked.apiSecret) {
    return {
      id: linked.id,
      label: linked.label,
      cfg: {
        baseUrl: linked.baseUrl.replace(/\/$/, ""),
        apiKey: linked.apiKey,
        apiSecret: linked.apiSecret,
      },
    };
  }

  const instances = await getAllOsfErpInstances(companyId);
  if (instances.length === 0) return null;

  const byLabel = instances.find((i) => /cosmo|cosmetic/i.test(i.label ?? ""));
  if (byLabel) return byLabel;

  const byUrl = instances.find((i) => /cosmetic/i.test(i.cfg.baseUrl));
  if (byUrl) return byUrl;

  return instances[0] ?? null;
}

/**
 * Cosmetics.lk / ERP_1 Standard Selling. Never LWK (ERP_2) — trading list can lag the shop.
 */
export async function resolveCosmoCatalogErpInstance(
  companyId: string
): Promise<OsfErpInstance | null> {
  const [locations, instances] = await Promise.all([
    prisma.companyLocation.findMany({
      where: { companyId },
      select: {
        name: true,
        locationReference: true,
        erpnextInstanceId: true,
      },
    }),
    getAllOsfErpInstances(companyId),
  ]);
  const picked = pickCosmoCatalogErpInstance({
    locations: locations.map((loc) => ({
      name: loc.name,
      locationReference: loc.locationReference,
      instanceId: loc.erpnextInstanceId,
    })),
    instances: instances.map((row) => ({
      id: row.id,
      label: row.label,
      baseUrl: row.cfg.baseUrl,
    })),
  });
  if (!picked) return null;
  return instances.find((row) => row.id === picked.id) ?? null;
}

async function fetchSellingPricesBySku(input: {
  cfg: OsfErpCredentials;
  priceList: string;
  itemCodes: string[];
}): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const items = [...new Set(input.itemCodes.map((s) => s.trim()).filter(Boolean))];
  if (items.length === 0) return out;

  for (let i = 0; i < items.length; i += ITEM_BATCH) {
    const batch = items.slice(i, i + ITEM_BATCH);
    const filters = JSON.stringify([
      ["price_list", "=", input.priceList],
      ["item_code", "in", batch],
      ["selling", "=", 1],
    ]);
    const fields = JSON.stringify(["item_code", "price_list_rate"]);
    const path =
      `/api/resource/Item Price?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}&limit_page_length=${ITEM_BATCH * 2}`;

    const json = await erpGetJson<{
      data?: Array<{ item_code?: string; price_list_rate?: number }>;
    }>(input.cfg, path);

    for (const row of json.data ?? []) {
      const sku = row.item_code?.trim();
      const money = toMoneyString(row.price_list_rate);
      if (!sku || !money) continue;
      out[sku] = money;
    }
  }

  return out;
}

/** Fetch OGF Price List rates for specific item codes (SKU). */
export async function fetchLwkItemPricesBySku(input: {
  cfg: OsfErpCredentials;
  itemCodes: string[];
}): Promise<Record<string, string>> {
  return fetchSellingPricesBySku({
    cfg: input.cfg,
    priceList: LWK_STICKER_PRICE_LIST,
    itemCodes: input.itemCodes,
  });
}

/** Fetch Standard Selling rates for specific item codes (SKU). */
export async function fetchStandardSellingPricesBySku(input: {
  cfg: OsfErpCredentials;
  itemCodes: string[];
}): Promise<Record<string, string>> {
  return fetchSellingPricesBySku({
    cfg: input.cfg,
    priceList: STANDARD_SELLING_PRICE_LIST,
    itemCodes: input.itemCodes,
  });
}

/** Paginate all selling rates on the LWK/OGF price list. */
export async function fetchAllLwkItemPrices(
  cfg: OsfErpCredentials
): Promise<Record<string, string>> {
  return fetchAllItemPricesForList(cfg, LWK_STICKER_PRICE_LIST);
}

/** Paginate all selling rates on Standard Selling. */
export async function fetchAllStandardSellingPrices(
  cfg: OsfErpCredentials
): Promise<Record<string, string>> {
  return fetchAllItemPricesForList(cfg, STANDARD_SELLING_PRICE_LIST);
}

async function fetchAllItemPricesForList(
  cfg: OsfErpCredentials,
  priceList: string
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let start = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const filters = JSON.stringify([
      ["price_list", "=", priceList],
      ["selling", "=", 1],
    ]);
    const fields = JSON.stringify(["item_code", "price_list_rate"]);
    const path =
      `/api/resource/Item Price?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&limit_page_length=${PAGE_LENGTH}&limit_start=${start}`;

    const json = await erpGetJson<{
      data?: Array<{ item_code?: string; price_list_rate?: number }>;
    }>(cfg, path);

    const rows = json.data ?? [];
    for (const row of rows) {
      const sku = row.item_code?.trim();
      const money = toMoneyString(row.price_list_rate);
      if (!sku || !money) continue;
      out[sku] = money;
    }

    if (rows.length < PAGE_LENGTH) break;
    start += PAGE_LENGTH;
  }

  return out;
}

/**
 * Load LWK sticker prices from Cosmo ERP (OGF Price List).
 * Returns {} on missing instance / ERP errors — never invents prices.
 */
export async function loadLwkStickerPricesBySku(
  companyId: string
): Promise<Record<string, string>> {
  const instance = await resolveLwkErpInstance(companyId);
  if (!instance) return {};
  try {
    return await fetchAllLwkItemPrices(instance.cfg);
  } catch {
    return {};
  }
}

/**
 * Load Standard Selling rates from Cosmo ERP (Cosmetics.lk / ERP_1).
 */
export async function loadStandardSellingPricesBySku(
  companyId: string
): Promise<Record<string, string>> {
  const instance = await resolveCosmoCatalogErpInstance(companyId);
  if (!instance) return {};
  try {
    return await fetchAllStandardSellingPrices(instance.cfg);
  } catch {
    return {};
  }
}

/**
 * Write Cosmo ERP Standard Selling rates onto ProductItem.price (all locations for SKU).
 * Does not invent prices; on ERP failure leaves OS prices unchanged.
 */
export async function syncStandardSellingToProductItems(
  companyId: string
): Promise<{ status: "ok" | "failed" | "not_configured"; updated: number; error: string | null }> {
  const instance = await resolveCosmoCatalogErpInstance(companyId);
  if (!instance) {
    return { status: "not_configured", updated: 0, error: "No Cosmo ERP instance" };
  }
  try {
    const prices = await fetchAllStandardSellingPrices(instance.cfg);
    if (Object.keys(prices).length === 0) {
      return { status: "ok", updated: 0, error: null };
    }

    const osItems = await prisma.productItem.findMany({
      where: { companyId, sku: { not: null } },
      select: { id: true, sku: true, price: true },
    });
    const planned = planStandardSellingPriceUpdates(
      osItems.map((row) => ({
        id: row.id,
        sku: row.sku,
        price: row.price.toFixed(2),
      })),
      prices,
    );

    let updated = 0;
    for (const { price, ids } of planned) {
      for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
        const chunk = ids.slice(i, i + UPDATE_CHUNK);
        const result = await prisma.productItem.updateMany({
          where: { companyId, id: { in: chunk } },
          data: { price: new Prisma.Decimal(price) },
        });
        updated += result.count;
      }
    }
    return { status: "ok", updated, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Standard Selling sync failed";
    return { status: "failed", updated: 0, error: message.slice(0, 300) };
  }
}
