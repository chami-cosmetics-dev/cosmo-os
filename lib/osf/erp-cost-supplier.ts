import "server-only";

import {
  getOsfErpCredentials,
  OsfErpError,
  type OsfErpCredentials,
} from "@/lib/osf/erp-stock";

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

export { getOsfErpCredentials, OsfErpError };
