import "server-only";

import { Prisma } from "@prisma/client";

import {
  getAllOsfErpInstances,
  OsfErpError,
  type OsfErpCredentials,
  type OsfErpInstance,
} from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";

/** Cosmo ERP selling price list used by LWK POS. */
export const LWK_STICKER_PRICE_LIST = "OGF Price List";

/** Cosmo ERP standard catalog selling list (non-LWK stickers / OS product price). */
export const STANDARD_SELLING_PRICE_LIST = "Standard Selling";

const PAGE_LENGTH = 500;
const MAX_PAGES = 80;
const ITEM_BATCH = 100;

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

/** Fetch OGF Price List rates for specific item codes (SKU). */
export async function fetchLwkItemPricesBySku(input: {
  cfg: OsfErpCredentials;
  itemCodes: string[];
}): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const items = [...new Set(input.itemCodes.map((s) => s.trim()).filter(Boolean))];
  if (items.length === 0) return out;

  for (let i = 0; i < items.length; i += ITEM_BATCH) {
    const batch = items.slice(i, i + ITEM_BATCH);
    const filters = JSON.stringify([
      ["price_list", "=", LWK_STICKER_PRICE_LIST],
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
 * Load Standard Selling rates from Cosmo ERP for non-LWK stickers / OS sync.
 */
export async function loadStandardSellingPricesBySku(
  companyId: string
): Promise<Record<string, string>> {
  const instance = await resolveLwkErpInstance(companyId);
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
  const instance = await resolveLwkErpInstance(companyId);
  if (!instance) {
    return { status: "not_configured", updated: 0, error: "No Cosmo ERP instance" };
  }
  try {
    const prices = await fetchAllStandardSellingPrices(instance.cfg);
    const entries = Object.entries(prices);
    if (entries.length === 0) {
      return { status: "ok", updated: 0, error: null };
    }

    let updated = 0;
    for (let i = 0; i < entries.length; i += ITEM_BATCH) {
      const chunk = entries.slice(i, i + ITEM_BATCH);
      await Promise.all(
        chunk.map(async ([erpSku, money]) => {
          const n = Number(money);
          if (!Number.isFinite(n) || n <= 0) return;
          const result = await prisma.productItem.updateMany({
            where: {
              companyId,
              sku: { equals: erpSku, mode: "insensitive" },
            },
            data: { price: new Prisma.Decimal(n.toFixed(2)) },
          });
          updated += result.count;
        })
      );
    }
    return { status: "ok", updated, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Standard Selling sync failed";
    return { status: "failed", updated: 0, error: message.slice(0, 300) };
  }
}
