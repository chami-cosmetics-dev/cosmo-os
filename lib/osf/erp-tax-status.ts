import "server-only";

import { OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { normalizeSkuKey } from "@/lib/product-items/erp-priority-sync";

/** Cosmetics.lk / trading Item Manufacturing → Tax Status. */
export const ERP_TAX_STATUS_FIELD = "custom_tax_status";

const ITEM_BATCH = 80;

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

function pickTaxStatus(row: Record<string, unknown>): string | null {
  const value = row[ERP_TAX_STATUS_FIELD];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

/** SKU → Tax Status (`Vat` / `Non Vat` / `Vat / Non Vat`). Missing item omitted. */
export async function fetchErpTaxStatusBySkus(
  cfg: OsfErpCredentials,
  itemCodes: string[],
): Promise<Map<string, string | null>> {
  const items = [...new Set(itemCodes.map((s) => s.trim()).filter(Boolean))];
  const bySku = new Map<string, string | null>();
  if (items.length === 0) return bySku;

  const fields = JSON.stringify(["name", "item_code", ERP_TAX_STATUS_FIELD]);

  for (let i = 0; i < items.length; i += ITEM_BATCH) {
    const batch = items.slice(i, i + ITEM_BATCH);
    const filters = JSON.stringify([["item_code", "in", batch]]);
    const path =
      `/api/resource/Item?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}&limit_page_length=${ITEM_BATCH}`;
    const json = await erpGetJson<{ data?: Array<Record<string, unknown>> }>(cfg, path);
    for (const row of json.data ?? []) {
      const code = String(row.item_code ?? row.name ?? "").trim();
      if (!code) continue;
      bySku.set(normalizeSkuKey(code), pickTaxStatus(row));
    }
  }

  return bySku;
}

export function mergeTaxStatusMaps(
  maps: Array<Map<string, string | null>>,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const map of maps) {
    for (const [sku, value] of map) {
      if (!out.has(sku) || out.get(sku) == null) out.set(sku, value);
    }
  }
  return out;
}
