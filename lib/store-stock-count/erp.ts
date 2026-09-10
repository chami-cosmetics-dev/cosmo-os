import "server-only";

import { prisma } from "@/lib/prisma";
import { normalizeSkuKey } from "@/lib/store-stock-count/company-key";
import {
  getAllOsfErpInstances,
  OsfErpError,
  type OsfErpCredentials,
  type OsfErpInstance,
} from "@/lib/osf/erp-stock";
import type {
  SelectableErpCompany,
  StoreStockCountApiItem,
  StoreStockCountWarehouseColumn,
} from "@/lib/store-stock-count/types";

const PAGE_LENGTH = 1000;
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

async function erpPostMethod<T>(
  cfg: OsfErpCredentials,
  method: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}/api/method/${method}`, {
    method: "POST",
    headers: {
      ...authHeaders(cfg),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(
      `ERPNext POST ${method} [${res.status}]: ${text.slice(0, 300)}`,
    );
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
    if (!/\b(main|shop)\b/i.test(name)) continue;
    if (name) names.push(name);
  }
  return names;
}

export async function listErpWarehousesForCompany(input: {
  companyId: string;
  instanceId: string;
  erpCompany: string;
}): Promise<StoreStockCountWarehouseColumn[]> {
  const instances = await getAllOsfErpInstances(input.companyId);
  const inst = resolveInstance(instances, input.instanceId);
  if (!inst) {
    throw new StoreStockCountErpError("ERP instance not found for this OS", 400);
  }

  const erpCompany = input.erpCompany.trim();
  await assertCompanyExists(inst.cfg, erpCompany);
  const instanceLabel = (inst.label ?? inst.id).trim() || inst.id;
  const warehouses = await fetchWarehousesForCompany(inst.cfg, erpCompany);
  return warehouses.map((warehouse) => ({
    key: `${inst.id}::${erpCompany}::${warehouse}`,
    label: warehouse,
    warehouse,
    instanceId: inst.id,
    instanceLabel,
    erpCompany,
  }));
}

async function fetchStockItems(cfg: OsfErpCredentials): Promise<
  Array<{ item_code: string; item_name: string; description: string; barcode: string }>
> {
  const filters = [
    ["disabled", "=", 0],
    ["is_stock_item", "=", 1],
  ];
  let rows: Array<{
    item_code?: string;
    name?: string;
    item_name?: string;
    description?: string;
    barcode?: string;
  }>;
  try {
    rows = await paginateResource({
      cfg,
      doctype: "Item",
      fields: ["item_code", "item_name", "description", "barcode"],
      filters,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("barcode") && !msg.includes("Field not permitted")) throw err;
    rows = await paginateResource({
      cfg,
      doctype: "Item",
      fields: ["item_code", "item_name", "description"],
      filters,
    });
  }

  return rows
    .map((row) => {
      const code = String(row.item_code ?? row.name ?? "").trim();
      if (!code) return null;
      return {
        item_code: code,
        item_name: String(row.item_name ?? "").trim(),
        barcode: String(row.barcode ?? "").trim(),
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
    absorbBarcodeRows(map, await paginateItemBarcodesViaGetList(cfg));
  } catch {
    // Child table list via method API is not always permitted.
  }
  if (map.size > 0) return map;

  const attempts: Array<{ fields: string[]; filters?: unknown }> = [
    {
      fields: ["parent", "barcode"],
      filters: [["parenttype", "=", "Item"]],
    },
    { fields: ["parent", "barcode"] },
    {
      fields: ["parent", "parenttype", "parentfield", "barcode"],
      filters: [
        ["parenttype", "=", "Item"],
        ["parentfield", "=", "barcodes"],
      ],
    },
  ];
  for (const attempt of attempts) {
    try {
      const rows = await paginateResource<{
        parent?: string;
        barcode?: string;
      }>({
        cfg,
        doctype: "Item Barcode",
        fields: attempt.fields,
        filters: attempt.filters,
      });
      absorbBarcodeRows(map, rows);
      if (map.size > 0) return map;
    } catch {
      // Try the next Item Barcode query shape.
    }
  }
  return map;
}

function absorbBarcodeRows(
  map: Map<string, string[]>,
  rows: Array<{ parent?: string; barcode?: string }>,
) {
  for (const row of rows) {
    pushBarcode(map, String(row.parent ?? ""), String(row.barcode ?? ""));
  }
}

function pushBarcode(map: Map<string, string[]>, itemCode: string, barcode: string) {
  const code = itemCode.trim();
  const bc = barcode.trim();
  if (!code || !bc) return;
  for (const key of new Set([code, normalizeSkuKey(code)])) {
    const list = map.get(key) ?? [];
    if (!list.includes(bc)) list.push(bc);
    map.set(key, list);
  }
}

async function paginateItemBarcodesViaGetList(
  cfg: OsfErpCredentials,
): Promise<Array<{ parent?: string; barcode?: string }>> {
  const withParent = await paginateGetListBarcodes(cfg, [
    ["parenttype", "=", "Item"],
  ]);
  if (withParent.length > 0) return withParent;
  return paginateGetListBarcodes(cfg, undefined);
}

async function paginateGetListBarcodes(
  cfg: OsfErpCredentials,
  filters: unknown[] | undefined,
): Promise<Array<{ parent?: string; barcode?: string }>> {
  const out: Array<{ parent?: string; barcode?: string }> = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const json = await erpPostMethod<{
      message?: Array<{ parent?: string; barcode?: string }>;
    }>(cfg, "frappe.client.get_list", {
      doctype: "Item Barcode",
      fields: ["parent", "barcode"],
      ...(filters ? { filters } : {}),
      limit_page_length: PAGE_LENGTH,
      limit_start: page * PAGE_LENGTH,
    });
    const rows = json.message ?? [];
    out.push(...rows);
    if (rows.length < PAGE_LENGTH) break;
    if (page === MAX_PAGES - 1 && rows.length === PAGE_LENGTH) {
      throw new OsfErpError(
        `ERP Item Barcode exceeded ${MAX_PAGES * PAGE_LENGTH} rows — raise MAX_PAGES`,
      );
    }
  }
  return out;
}

async function fetchOsBarcodeMap(
  companyId: string,
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const rows = await prisma.productItem.findMany({
    where: {
      companyId,
      sku: { not: null },
      barcode: { not: null },
    },
    select: { sku: true, barcode: true },
  });
  for (const row of rows) {
    pushBarcode(map, row.sku ?? "", row.barcode ?? "");
  }
  return map;
}

function mergeBarcodeMaps(
  into: Map<string, string[]>,
  extra: Map<string, string[]>,
) {
  for (const [key, barcodes] of extra) {
    for (const barcode of barcodes) pushBarcode(into, key, barcode);
  }
}

function toWarehouseColumns(
  inst: OsfErpInstance,
  erpCompany: string,
  warehouses: string[],
): StoreStockCountWarehouseColumn[] {
  const instanceLabel = (inst.label ?? inst.id).trim() || inst.id;
  return warehouses.map((warehouse) => ({
    key: `${inst.id}::${erpCompany}::${warehouse}`,
    label: warehouse,
    warehouse,
    instanceId: inst.id,
    instanceLabel,
    erpCompany,
  }));
}

function catalogToApiItems(
  catalog: Array<{
    item_code: string;
    item_name: string;
    description: string;
    barcode: string;
  }>,
  barcodeMap: Map<string, string[]>,
  binQty: Map<string, Map<string, number>>,
  warehouseColumns: StoreStockCountWarehouseColumn[],
): StoreStockCountApiItem[] {
  return catalog.map((row) => ({
    sku: row.item_code,
    name: row.item_name || row.item_code,
    description: row.description,
    barcodes: [
      ...new Set(
        [
          row.barcode,
          ...(barcodeMap.get(row.item_code) ?? []),
          ...(barcodeMap.get(normalizeSkuKey(row.item_code)) ?? []),
        ]
          .map((barcode) => barcode.trim())
          .filter(Boolean),
      ),
    ],
    stockByWarehouse: Object.fromEntries(
      warehouseColumns.map((col) => [
        col.key,
        binQty.get(row.item_code)?.get(col.warehouse) ?? 0,
      ]),
    ),
    stock: warehouseColumns.reduce(
      (sum, col) => sum + (binQty.get(row.item_code)?.get(col.warehouse) ?? 0),
      0,
    ),
  }));
}

async function fetchBinQtyByItemAndWarehouse(
  cfg: OsfErpCredentials,
  warehouses: string[],
): Promise<Map<string, Map<string, number>>> {
  const qty = new Map<string, Map<string, number>>();
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
      const warehouse = String(row.warehouse ?? "").trim();
      if (!item) continue;
      if (!warehouse) continue;
      const n = Number(row.actual_qty);
      if (!Number.isFinite(n)) continue;
      const byWarehouse = qty.get(item) ?? new Map<string, number>();
      byWarehouse.set(warehouse, (byWarehouse.get(warehouse) ?? 0) + n);
      qty.set(item, byWarehouse);
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

function wrapErpError(err: unknown): StoreStockCountErpError {
  if (err instanceof StoreStockCountErpError) return err;
  if (err instanceof OsfErpError && err.message.startsWith("Unknown ERP company")) {
    return new StoreStockCountErpError(err.message, 400);
  }
  return new StoreStockCountErpError(
    err instanceof Error ? err.message : String(err),
    502,
  );
}

export async function fetchCompanyStockItems(input: {
  companyId: string;
  instanceId: string;
  erpCompany: string;
  warehouses?: StoreStockCountWarehouseColumn[];
}): Promise<{
  instanceId: string;
  instanceLabel: string;
  erpCompany: string;
  warehouses: StoreStockCountWarehouseColumn[];
  items: StoreStockCountApiItem[];
}> {
  const results = await fetchStockForSelectedCompanies({
    companyId: input.companyId,
    companies: [
      {
        instanceId: input.instanceId,
        instanceLabel: "",
        erpCompany: input.erpCompany,
      },
    ],
    warehouses: input.warehouses,
  });
  const row = results[0];
  if (!row) {
    throw new StoreStockCountErpError("ERP instance not found for this OS", 400);
  }
  return row;
}

export async function fetchStockForSelectedCompanies(input: {
  companyId: string;
  companies: SelectableErpCompany[];
  warehouses?: StoreStockCountWarehouseColumn[];
}): Promise<
  Array<{
    instanceId: string;
    instanceLabel: string;
    erpCompany: string;
    warehouses: StoreStockCountWarehouseColumn[];
    items: StoreStockCountApiItem[];
  }>
> {
  const [instances, osBarcodes] = await Promise.all([
    getAllOsfErpInstances(input.companyId),
    fetchOsBarcodeMap(input.companyId),
  ]);
  const warehousesByCompany = new Map<string, StoreStockCountWarehouseColumn[]>();
  for (const warehouse of input.warehouses ?? []) {
    const key = `${warehouse.instanceId}::${warehouse.erpCompany}`;
    const list = warehousesByCompany.get(key) ?? [];
    list.push(warehouse);
    warehousesByCompany.set(key, list);
  }

  const byInstance = new Map<string, SelectableErpCompany[]>();
  for (const company of input.companies) {
    const list = byInstance.get(company.instanceId) ?? [];
    list.push(company);
    byInstance.set(company.instanceId, list);
  }

  const groups = await Promise.all(
    [...byInstance.entries()].map(async ([instanceId, companies]) => {
      const inst = resolveInstance(instances, instanceId);
      if (!inst) {
        throw new StoreStockCountErpError("ERP instance not found for this OS", 400);
      }

      try {
        await Promise.all(
          companies.map((company) =>
            assertCompanyExists(inst.cfg, company.erpCompany.trim()),
          ),
        );
      } catch (err) {
        throw wrapErpError(err);
      }

      const warehouseColumnsByCompany = new Map<
        string,
        StoreStockCountWarehouseColumn[]
      >();
      const warehouseNames = new Set<string>();
      for (const company of companies) {
        const erpCompany = company.erpCompany.trim();
        const key = `${inst.id}::${erpCompany}`;
        const selected = warehousesByCompany.get(key);
        const columns =
          selected && selected.length > 0
            ? selected
            : toWarehouseColumns(
                inst,
                erpCompany,
                await fetchWarehousesForCompany(inst.cfg, erpCompany),
              );
        warehouseColumnsByCompany.set(key, columns);
        for (const col of columns) warehouseNames.add(col.warehouse);
      }

      try {
        const [catalog, barcodeMap, binQty] = await Promise.all([
          fetchStockItems(inst.cfg),
          fetchBarcodeMap(inst.cfg),
          fetchBinQtyByItemAndWarehouse(inst.cfg, [...warehouseNames]),
        ]);
        mergeBarcodeMaps(barcodeMap, osBarcodes);
        return companies.map((company) => {
          const erpCompany = company.erpCompany.trim();
          const key = `${inst.id}::${erpCompany}`;
          const warehouseColumns = warehouseColumnsByCompany.get(key) ?? [];
          const instanceLabel = (inst.label ?? inst.id).trim() || inst.id;
          return {
            instanceId: inst.id,
            instanceLabel,
            erpCompany,
            warehouses: warehouseColumns,
            items: catalogToApiItems(
              catalog,
              barcodeMap,
              binQty,
              warehouseColumns,
            ),
          };
        });
      } catch (err) {
        throw wrapErpError(err);
      }
    }),
  );

  return groups.flat();
}

export async function fetchMergedBarcodeMap(input: {
  companyId: string;
  instanceIds: string[];
}): Promise<Map<string, string[]>> {
  const [instances, osBarcodes] = await Promise.all([
    getAllOsfErpInstances(input.companyId),
    fetchOsBarcodeMap(input.companyId),
  ]);
  const map = new Map<string, string[]>();
  mergeBarcodeMaps(map, osBarcodes);
  const uniqueIds = [...new Set(input.instanceIds.filter(Boolean))];
  await Promise.all(
    uniqueIds.map(async (instanceId) => {
      const inst = resolveInstance(instances, instanceId);
      if (!inst) return;
      mergeBarcodeMaps(map, await fetchBarcodeMap(inst.cfg));
    }),
  );
  return map;
}
