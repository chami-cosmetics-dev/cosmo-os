import "server-only";

import {
  getAllOsfErpInstances,
  OsfErpError,
  type OsfErpCredentials,
  type OsfErpInstance,
} from "@/lib/osf/erp-stock";
import type { SelectableErpCompany, StoreStockCountApiItem } from "@/lib/store-stock-count/types";

const PAGE_LENGTH = 500;
const MAX_PAGES = 80;

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

async function paginateResource<T extends Record<string, unknown>>(input: {
  cfg: OsfErpCredentials;
  doctype: string;
  fields: string[];
  filters?: unknown;
}): Promise<T[]> {
  const out: T[] = [];
  const fields = encodeURIComponent(JSON.stringify(input.fields));
  const filterQ = input.filters
    ? `&filters=${encodeURIComponent(JSON.stringify(input.filters))}`
    : "";

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const path =
      `/api/resource/${encodeURIComponent(input.doctype)}?fields=${fields}` +
      `${filterQ}&limit_page_length=${PAGE_LENGTH}&limit_start=${page * PAGE_LENGTH}`;
    const json = await erpGetJson<{ data?: T[] }>(input.cfg, path);
    const rows = json.data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_LENGTH) break;
    if (page === MAX_PAGES - 1 && rows.length === PAGE_LENGTH) {
      throw new OsfErpError(
        `ERP ${input.doctype} exceeded ${MAX_PAGES * PAGE_LENGTH} rows — raise MAX_PAGES`,
      );
    }
  }
  return out;
}

export async function listErpCompaniesForOsCompany(
  companyId: string,
): Promise<{ companies: SelectableErpCompany[]; allFailed: boolean; errors: string[] }> {
  const instances = await getAllOsfErpInstances(companyId);
  const companies: SelectableErpCompany[] = [];
  const errors: string[] = [];
  let okCount = 0;

  await Promise.all(
    instances.map(async (inst) => {
      try {
        const rows = await paginateResource<{ name?: string }>({
          cfg: inst.cfg,
          doctype: "Company",
          fields: ["name"],
        });
        okCount += 1;
        for (const row of rows) {
          const name = String(row.name ?? "").trim();
          if (!name) continue;
          companies.push({
            instanceId: inst.id,
            instanceLabel: (inst.label ?? inst.id).trim() || inst.id,
            erpCompany: name,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${inst.label ?? inst.id}: ${msg}`);
      }
    }),
  );

  companies.sort((a, b) => {
    const la = a.instanceLabel.localeCompare(b.instanceLabel);
    if (la !== 0) return la;
    return a.erpCompany.localeCompare(b.erpCompany);
  });

  return {
    companies,
    allFailed: instances.length > 0 && okCount === 0,
    errors,
  };
}

function resolveInstance(
  instances: OsfErpInstance[],
  instanceId: string,
): OsfErpInstance | null {
  return instances.find((i) => i.id === instanceId) ?? null;
}

async function assertCompanyExists(cfg: OsfErpCredentials, erpCompany: string): Promise<void> {
  const filters = [["name", "=", erpCompany]];
  const fields = encodeURIComponent(JSON.stringify(["name"]));
  const path =
    `/api/resource/Company?filters=${encodeURIComponent(JSON.stringify(filters))}` +
    `&fields=${fields}&limit_page_length=1`;
  const json = await erpGetJson<{ data?: Array<{ name?: string }> }>(cfg, path);
  const hit = (json.data ?? []).some((r) => String(r.name ?? "").trim() === erpCompany);
  if (!hit) {
    throw new OsfErpError(`Unknown ERP company: ${erpCompany}`);
  }
}

async function fetchWarehousesForCompany(
  cfg: OsfErpCredentials,
  erpCompany: string,
): Promise<string[]> {
  const filters: unknown[] = [
    ["company", "=", erpCompany],
    ["is_group", "=", 0],
  ];
  const rows = await paginateResource<{ name?: string; disabled?: number | boolean }>({
    cfg,
    doctype: "Warehouse",
    fields: ["name", "disabled"],
    filters,
  });
  const names: string[] = [];
  for (const row of rows) {
    if (row.disabled === 1 || row.disabled === true) continue;
    const name = String(row.name ?? "").trim();
    if (name) names.push(name);
  }
  return names;
}

async function fetchStockItems(cfg: OsfErpCredentials): Promise<
  Array<{ item_code: string; item_name: string; description: string }>
> {
  const filters = [
    ["disabled", "=", 0],
    ["is_stock_item", "=", 1],
  ];
  // Do NOT request Item.barcode — ERPNext list API rejects it
  // ("Field not permitted in query: barcode"). Barcodes come from Item Barcode.
  const rows = await paginateResource<{
    item_code?: string;
    name?: string;
    item_name?: string;
    description?: string;
  }>({
    cfg,
    doctype: "Item",
    fields: ["item_code", "item_name", "description"],
    filters,
  });

  return rows
    .map((row) => {
      const code = String(row.item_code ?? row.name ?? "").trim();
      if (!code) return null;
      return {
        item_code: code,
        item_name: String(row.item_name ?? "").trim(),
        description: String(row.description ?? "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);
}

async function fetchBarcodeMap(cfg: OsfErpCredentials): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  try {
    const rows = await paginateResource<{ parent?: string; barcode?: string }>({
      cfg,
      doctype: "Item Barcode",
      fields: ["parent", "barcode"],
    });
    for (const row of rows) {
      const parent = String(row.parent ?? "").trim();
      const barcode = String(row.barcode ?? "").trim();
      if (!parent || !barcode) continue;
      const list = map.get(parent) ?? [];
      if (!list.includes(barcode)) list.push(barcode);
      map.set(parent, list);
    }
  } catch {
    // Child table may be missing or permission-denied — items load with empty barcodes.
  }
  return map;
}

async function fetchBinQtyByItem(
  cfg: OsfErpCredentials,
  warehouses: string[],
): Promise<Map<string, number>> {
  const qty = new Map<string, number>();
  if (warehouses.length === 0) return qty;

  const WH_BATCH = 40;
  for (let i = 0; i < warehouses.length; i += WH_BATCH) {
    const batch = warehouses.slice(i, i + WH_BATCH);
    const filters = [["warehouse", "in", batch]];
    const rows = await paginateResource<{
      item_code?: string;
      warehouse?: string;
      actual_qty?: number;
    }>({
      cfg,
      doctype: "Bin",
      fields: ["item_code", "warehouse", "actual_qty"],
      filters,
    });
    for (const row of rows) {
      const item = String(row.item_code ?? "").trim();
      if (!item) continue;
      const n = Number(row.actual_qty);
      if (!Number.isFinite(n)) continue;
      qty.set(item, (qty.get(item) ?? 0) + n);
    }
  }
  return qty;
}

export class StoreStockCountErpError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 502,
  ) {
    super(message);
    this.name = "StoreStockCountErpError";
  }
}

export async function fetchCompanyStockItems(input: {
  companyId: string;
  instanceId: string;
  erpCompany: string;
}): Promise<{
  instanceId: string;
  instanceLabel: string;
  erpCompany: string;
  items: StoreStockCountApiItem[];
}> {
  const instances = await getAllOsfErpInstances(input.companyId);
  const inst = resolveInstance(instances, input.instanceId);
  if (!inst) {
    throw new StoreStockCountErpError("ERP instance not found for this OS", 400);
  }

  const erpCompany = input.erpCompany.trim();
  try {
    await assertCompanyExists(inst.cfg, erpCompany);
  } catch (err) {
    if (err instanceof OsfErpError && err.message.startsWith("Unknown ERP company")) {
      throw new StoreStockCountErpError(err.message, 400);
    }
    throw new StoreStockCountErpError(
      err instanceof Error ? err.message : String(err),
      502,
    );
  }

  try {
    const [catalog, barcodeMap, warehouses] = await Promise.all([
      fetchStockItems(inst.cfg),
      fetchBarcodeMap(inst.cfg),
      fetchWarehousesForCompany(inst.cfg, erpCompany),
    ]);
    const binQty = await fetchBinQtyByItem(inst.cfg, warehouses);

    const items: StoreStockCountApiItem[] = catalog.map((row) => ({
      sku: row.item_code,
      name: row.item_name || row.item_code,
      description: row.description,
      barcodes: [...(barcodeMap.get(row.item_code) ?? [])],
      stock: binQty.get(row.item_code) ?? 0,
    }));

    return {
      instanceId: inst.id,
      instanceLabel: (inst.label ?? inst.id).trim() || inst.id,
      erpCompany,
      items,
    };
  } catch (err) {
    if (err instanceof StoreStockCountErpError) throw err;
    throw new StoreStockCountErpError(
      err instanceof Error ? err.message : String(err),
      502,
    );
  }
}
