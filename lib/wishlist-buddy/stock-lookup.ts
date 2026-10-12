import "server-only";

import { getAllOsfErpInstances, OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { isExcludedErpCompany } from "@/lib/vault-osf/types";
import {
  buildInstanceStockSources,
  sortStockSources,
  type ErpBinRow,
  type ErpWarehouseRow,
  type StockLookupResult,
} from "@/lib/wishlist-buddy/stock-sources";

const ERP_TIMEOUT_MS = 15_000;

async function erpGetJson<T>(cfg: OsfErpCredentials, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: {
      Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(ERP_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${path} [${res.status}]: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

function resourcePath(doctype: string, filters: unknown[], fields: string[], limit: number): string {
  return (
    `/api/resource/${encodeURIComponent(doctype)}` +
    `?filters=${encodeURIComponent(JSON.stringify(filters))}` +
    `&fields=${encodeURIComponent(JSON.stringify(fields))}` +
    `&limit_page_length=${limit}`
  );
}

async function fetchBinsForItem(cfg: OsfErpCredentials, itemCode: string): Promise<ErpBinRow[]> {
  const json = await erpGetJson<{ data?: ErpBinRow[] }>(
    cfg,
    resourcePath(
      "Bin",
      [["item_code", "=", itemCode]],
      ["warehouse", "actual_qty", "reserved_qty", "projected_qty"],
      1000,
    ),
  );
  return json.data ?? [];
}

async function fetchWarehouses(cfg: OsfErpCredentials, names: string[]): Promise<ErpWarehouseRow[]> {
  if (names.length === 0) return [];
  const json = await erpGetJson<{ data?: ErpWarehouseRow[] }>(
    cfg,
    resourcePath(
      "Warehouse",
      [["name", "in", names]],
      ["name", "company", "is_group", "disabled", "warehouse_type"],
      names.length,
    ),
  );
  return json.data ?? [];
}

/**
 * Where else is `itemCode` in stock, across every ERP instance configured for the company.
 * `excludeWarehouses` should hold the warehouse Shopify sells from (it is sold out there).
 */
export async function lookupStockAcrossErps(input: {
  companyId: string;
  itemCode: string;
  excludeWarehouses?: string[];
}): Promise<StockLookupResult> {
  const instances = await getAllOsfErpInstances(input.companyId);
  const result: StockLookupResult = { sources: [], failedInstances: [] };

  await Promise.all(
    instances.map(async (inst) => {
      const instanceLabel = (inst.label ?? inst.id).trim() || inst.id;
      try {
        const bins = await fetchBinsForItem(inst.cfg, input.itemCode);
        const names = [...new Set(bins.map((b) => (b.warehouse ?? "").trim()).filter(Boolean))];
        const warehouses = await fetchWarehouses(inst.cfg, names);
        result.sources.push(
          ...buildInstanceStockSources({
            instanceId: inst.id,
            instanceLabel,
            bins,
            warehouses,
            excludeWarehouses: input.excludeWarehouses,
            isExcludedCompany: isExcludedErpCompany,
          }),
        );
      } catch (error) {
        result.failedInstances.push({
          instanceId: inst.id,
          instanceLabel,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }),
  );

  if (instances.length === 0) {
    result.failedInstances.push({
      instanceId: "",
      instanceLabel: "",
      error: "No ERPNext instance configured for this company",
    });
  }

  result.sources = sortStockSources(
    result.sources,
    instances.map((i) => i.id),
  );
  return result;
}
