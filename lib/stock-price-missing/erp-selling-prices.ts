import "server-only";

import {
  LWK_STICKER_PRICE_LIST,
  STANDARD_SELLING_PRICE_LIST,
} from "@/lib/sticker-lwk-erp-price-list";
import { OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";

/** OGF list name variants across ERP1 / ERP2. */
export const OGF_PRICE_LIST_NAMES = [
  LWK_STICKER_PRICE_LIST, // "OGF Price List"
  "OGF PRICE LIST",
] as const;

const PAGE_LENGTH = 500;
const MAX_PAGES = 80;

export type SellingPricesBySku = {
  standard: Record<string, string>;
  ogf: Record<string, string>;
};

function toMoneyString(rate: number | null | undefined): string | null {
  if (rate == null) return null;
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function fetchItemPricesForList(
  cfg: OsfErpCredentials,
  priceList: string,
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

function mergePriceMaps(maps: Array<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const map of maps) {
    for (const [sku, rate] of Object.entries(map)) {
      if (!out[sku]) out[sku] = rate;
    }
  }
  return out;
}

/**
 * Standard Selling + OGF for one ERP instance.
 * VAT - Selling is optional and ignored for this report.
 */
export async function loadStandardAndOgfPrices(
  cfg: OsfErpCredentials,
): Promise<SellingPricesBySku> {
  const [standard, ogfA, ogfB] = await Promise.all([
    fetchItemPricesForList(cfg, STANDARD_SELLING_PRICE_LIST),
    fetchItemPricesForList(cfg, OGF_PRICE_LIST_NAMES[0]),
    fetchItemPricesForList(cfg, OGF_PRICE_LIST_NAMES[1]),
  ]);
  return {
    standard,
    ogf: mergePriceMaps([ogfA, ogfB]),
  };
}

const ITEM_BRAND_BATCH = 80;

/**
 * Item.brand from ERPNext for the given SKUs (Item name / item_code).
 */
export async function fetchItemBrandsBySku(
  cfg: OsfErpCredentials,
  skus: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const items = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  for (const sku of items) out.set(sku, null);
  if (items.length === 0) return out;

  for (let i = 0; i < items.length; i += ITEM_BRAND_BATCH) {
    const batch = items.slice(i, i + ITEM_BRAND_BATCH);
    const filters = JSON.stringify([["name", "in", batch]]);
    const fields = JSON.stringify(["name", "item_code", "brand"]);
    const path =
      `/api/resource/Item?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}&limit_page_length=${ITEM_BRAND_BATCH}`;

    const json = await erpGetJson<{
      data?: Array<{ name?: string; item_code?: string; brand?: string | null }>;
    }>(cfg, path);

    for (const row of json.data ?? []) {
      const sku = (row.item_code ?? row.name)?.trim();
      if (!sku) continue;
      const brand = row.brand?.trim() || null;
      out.set(sku, brand);
      if (row.name?.trim() && row.name.trim() !== sku) {
        out.set(row.name.trim(), brand);
      }
    }
  }

  return out;
}
