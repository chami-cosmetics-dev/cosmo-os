import "server-only";

import {
  getOsfErpCredentials,
  OsfErpError,
  type OsfErpCredentials,
} from "@/lib/osf/erp-stock";

function skuKey(value: string): string {
  return value.trim().toUpperCase();
}

export type ItemCostSupplier = {
  cost: number | null;
  supplier: string | null;
};

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

const ITEM_BATCH = 100;

/**
 * Latest cost from ERP Item `last_purchase_rate`.
 * Supplier left blank in v1 when not on the Item list fields (never invented).
 */
export async function fetchLatestCostAndSupplier(input: {
  cfg: OsfErpCredentials;
  itemCodes: string[];
}): Promise<Map<string, ItemCostSupplier>> {
  const result = new Map<string, ItemCostSupplier>();
  const items = [...new Set(input.itemCodes.map((s) => s.trim()).filter(Boolean))];
  for (const code of items) {
    result.set(code, { cost: null, supplier: null });
  }
  if (items.length === 0) return result;

  for (let i = 0; i < items.length; i += ITEM_BATCH) {
    const batch = items.slice(i, i + ITEM_BATCH);
    const filters = JSON.stringify([["name", "in", batch]]);
    const fields = JSON.stringify(["name", "last_purchase_rate"]);
    const path =
      `/api/resource/Item?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}&limit_page_length=${ITEM_BATCH}`;

    const json = await erpGetJson<{
      data?: Array<{ name?: string; last_purchase_rate?: number | string | null }>;
    }>(input.cfg, path);

    for (const row of json.data ?? []) {
      const name = row.name?.trim();
      if (!name) continue;
      const rate = row.last_purchase_rate != null ? Number(row.last_purchase_rate) : NaN;
      const cost = Number.isFinite(rate) && rate > 0 ? rate : null;
      result.set(name, { cost, supplier: null });
    }
  }

  return result;
}

function setSkuMapValue(map: Map<string, string>, sku: string, value: string) {
  if (!map.has(sku)) map.set(sku, value);
  const norm = skuKey(sku);
  if (norm && !map.has(norm)) map.set(norm, value);
}

function backfillSkuMap(map: Map<string, string>, items: string[]) {
  for (const code of items) {
    if (map.has(code)) continue;
    const hit = map.get(skuKey(code));
    if (hit) map.set(code, hit);
  }
}

function stillMissingItemField(map: Map<string, string>, code: string): boolean {
  return !map.has(code) && !map.has(skuKey(code));
}

/**
 * Item.country_of_origin + Item.brand from ERP1 then ERP2.
 * First non-empty value wins. Cosmo list API rejects custom_country_claim_type.
 */
export async function fetchItemCountriesAndBrands(input: {
  instances: Array<{ cfg: OsfErpCredentials }>;
  itemCodes: string[];
}): Promise<{ countryBySku: Map<string, string>; brandBySku: Map<string, string> }> {
  const countryBySku = new Map<string, string>();
  const brandBySku = new Map<string, string>();
  const items = [...new Set(input.itemCodes.map((s) => s.trim()).filter(Boolean))];
  if (items.length === 0 || input.instances.length === 0) {
    return { countryBySku, brandBySku };
  }

  for (const inst of input.instances) {
    const missing = items.filter(
      (code) =>
        stillMissingItemField(countryBySku, code) || stillMissingItemField(brandBySku, code),
    );
    if (missing.length === 0) break;
    try {
      for (let i = 0; i < missing.length; i += ITEM_BATCH) {
        const batch = missing.slice(i, i + ITEM_BATCH);
        const filters = JSON.stringify([["name", "in", batch]]);
        const fields = JSON.stringify(["name", "item_code", "country_of_origin", "brand"]);
        const path =
          `/api/resource/Item?filters=${encodeURIComponent(filters)}` +
          `&fields=${encodeURIComponent(fields)}&limit_page_length=${ITEM_BATCH}`;
        const json = await erpGetJson<{
          data?: Array<{
            name?: string;
            item_code?: string;
            country_of_origin?: string | null;
            brand?: string | null;
          }>;
        }>(inst.cfg, path);
        for (const row of json.data ?? []) {
          const country = row.country_of_origin?.trim() || "";
          const brand = row.brand?.trim() || "";
          if (!country && !brand) continue;
          for (const key of [row.name, row.item_code]) {
            const code = key?.trim();
            if (!code) continue;
            if (country) setSkuMapValue(countryBySku, code, country);
            if (brand) setSkuMapValue(brandBySku, code, brand);
          }
        }
      }
    } catch (err) {
      if (!(err instanceof OsfErpError)) throw err;
    }
  }
  backfillSkuMap(countryBySku, items);
  backfillSkuMap(brandBySku, items);
  return { countryBySku, brandBySku };
}

/** Item.country_of_origin only — Cosmo list API rejects custom_country_claim_type. */
export async function fetchItemCountries(input: {
  instances: Array<{ cfg: OsfErpCredentials }>;
  itemCodes: string[];
}): Promise<Map<string, string>> {
  const { countryBySku } = await fetchItemCountriesAndBrands(input);
  return countryBySku;
}

export { getOsfErpCredentials, OsfErpError };
