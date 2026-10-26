import "server-only";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { listTransferWarehouses, resolveTransferSlots } from "@/lib/material-transfer/erp";
import { isShopWarehouseName } from "@/lib/item-trends/shop-warehouse-name";
import { isMainWarehouseName } from "@/lib/material-transfer/warehouses";
import { readOrderAvailabilityConfig } from "@/lib/order-availability/config";
import { loadPriorityWarehouseRows, toPriorityMap } from "@/lib/order-availability/priority-warehouses";
import {
  buildCompanyResults,
  capStatus,
  computeOrderValue,
  expandCommonSkuLines,
  isVariantSku,
  itemMatchesCommonSku,
  normalizeRequestLines,
  pickOptions,
  rankCompanies,
} from "@/lib/order-availability/rank";
import {
  MAX_DISTINCT_SKUS,
  NEAR_CAP_RATIO,
  type OrderAvailabilityResponse,
  type RequestLine,
  type SkuLine,
} from "@/lib/order-availability/types";
import { OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import { skuKey } from "@/lib/vat-status/types";

export class OrderAvailabilityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderAvailabilityInputError";
  }
}

const ITEM_BATCH = 80;
const INVOICE_PAGE = 200;
const INVOICE_MAX_PAGES = 100;

async function erpList<T>(
  cfg: OsfErpCredentials,
  doctype: string,
  params: Record<string, string>,
): Promise<T[]> {
  const query = new URLSearchParams(params).toString();
  const path = `/api/resource/${encodeURIComponent(doctype)}?${query}`;
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    headers: { Authorization: `token ${cfg.apiKey}:${cfg.apiSecret}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new OsfErpError(`ERPNext GET ${doctype} [${res.status}]: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: T[] };
  return Array.isArray(json.data) ? json.data : [];
}

/** ERP2 item_code + item_name per typed SKU key (case-insensitive). */
async function fetchItems(
  cfg: OsfErpCredentials,
  codes: string[],
): Promise<Map<string, { itemCode: string; itemName: string | null }>> {
  const out = new Map<string, { itemCode: string; itemName: string | null }>();
  const unique = [...new Set(codes)];
  for (let i = 0; i < unique.length; i += ITEM_BATCH) {
    const batch = unique.slice(i, i + ITEM_BATCH);
    const rows = await erpList<{ item_code?: string; item_name?: string }>(cfg, "Item", {
      filters: JSON.stringify([["item_code", "in", batch]]),
      fields: JSON.stringify(["item_code", "item_name"]),
      limit_page_length: String(batch.length * 2),
    });
    for (const row of rows) {
      const itemCode = row.item_code?.trim();
      if (!itemCode) continue;
      out.set(skuKey(itemCode), { itemCode, itemName: row.item_name?.trim() || null });
    }
  }
  return out;
}

const COMMON_SKU_BATCH = 10;

/** ERP2 items whose code is the common SKU or a `_N` / `-N` variant of it. */
async function fetchCommonSkuItems(
  cfg: OsfErpCredentials,
  commons: string[],
): Promise<Map<string, { itemCode: string; itemName: string | null }>> {
  const out = new Map<string, { itemCode: string; itemName: string | null }>();
  const prefixes = [...new Set(commons.map((sku) => sku.trim()).filter(Boolean))];
  if (prefixes.length === 0) return out;

  for (let i = 0; i < prefixes.length; i += COMMON_SKU_BATCH) {
    const batch = prefixes.slice(i, i + COMMON_SKU_BATCH);
    const orFilters: Array<[string, string, string]> = [];
    for (const prefix of batch) {
      for (const form of new Set([prefix, skuKey(prefix)])) {
        orFilters.push(["item_code", "=", form]);
        orFilters.push(["item_code", "like", `${form}_%`]);
        orFilters.push(["item_code", "like", `${form}-%`]);
      }
    }
    const rows = await erpList<{ item_code?: string; item_name?: string }>(cfg, "Item", {
      or_filters: JSON.stringify(orFilters),
      fields: JSON.stringify(["item_code", "item_name"]),
      limit_page_length: "500",
    });
    for (const row of rows) {
      const itemCode = row.item_code?.trim();
      if (!itemCode) continue;
      if (!batch.some((prefix) => itemMatchesCommonSku(itemCode, prefix))) continue;
      const key = skuKey(itemCode);
      if (!out.has(key)) out.set(key, { itemCode, itemName: row.item_name?.trim() || null });
    }
  }
  return out;
}

/** Sellable stock per `${warehouse}::${item_code}`: max(0, actual − reserved). */
async function fetchBinAvailable(
  cfg: OsfErpCredentials,
  warehouses: string[],
  itemCodes: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (warehouses.length === 0 || itemCodes.length === 0) return map;
  for (let i = 0; i < itemCodes.length; i += ITEM_BATCH) {
    const batch = itemCodes.slice(i, i + ITEM_BATCH);
    const rows = await erpList<{
      item_code?: string;
      warehouse?: string;
      actual_qty?: number;
      reserved_qty?: number;
    }>(cfg, "Bin", {
      filters: JSON.stringify([
        ["warehouse", "in", warehouses],
        ["item_code", "in", batch],
      ]),
      fields: JSON.stringify(["item_code", "warehouse", "actual_qty", "reserved_qty"]),
      limit_page_length: String(batch.length * warehouses.length),
    });
    for (const row of rows) {
      const item = row.item_code?.trim();
      const warehouse = row.warehouse?.trim();
      const actual = Number(row.actual_qty);
      if (!item || !warehouse || !Number.isFinite(actual)) continue;
      const reserved = Number(row.reserved_qty);
      const available = Math.max(0, actual - (Number.isFinite(reserved) ? reserved : 0));
      const key = `${warehouse}::${item}`;
      map.set(key, (map.get(key) ?? 0) + available);
    }
  }
  return map;
}

/** Submitted Sales Invoice net_total per company for the date range. Returns are negative, so this is net. */
async function fetchMtdSalesByCompany(
  cfg: OsfErpCredentials,
  companies: string[],
  fromYmd: string,
  toYmd: string,
): Promise<Map<string, number>> {
  const totals = new Map<string, number>(companies.map((company) => [company, 0]));
  if (companies.length === 0) return totals;
  const filters = JSON.stringify([
    ["company", "in", companies],
    ["posting_date", ">=", fromYmd],
    ["posting_date", "<=", toYmd],
    ["docstatus", "=", 1],
  ]);
  for (let page = 0; ; page += 1) {
    // An under-count would let an order through the cap, so a truncated read is an error.
    if (page >= INVOICE_MAX_PAGES) throw new OsfErpError("Too many sales invoices to total this month");
    const rows = await erpList<{ company?: string; net_total?: number | string }>(cfg, "Sales Invoice", {
      filters,
      fields: JSON.stringify(["company", "net_total"]),
      order_by: "posting_date asc, name asc",
      limit_start: String(page * INVOICE_PAGE),
      limit_page_length: String(INVOICE_PAGE),
    });
    for (const row of rows) {
      const company = row.company?.trim() ?? "";
      const net = Number(row.net_total ?? 0);
      if (!totals.has(company) || !Number.isFinite(net)) continue;
      totals.set(company, totals.get(company)! + net);
    }
    if (rows.length < INVOICE_PAGE) break;
  }
  for (const [company, value] of totals) totals.set(company, Math.round(value * 100) / 100);
  return totals;
}

async function localItems(companyId: string, skus: string[]) {
  const rows = await prisma.productItem.findMany({
    where: {
      companyId,
      OR: skus.map((sku) => ({ sku: { equals: sku, mode: "insensitive" as const } })),
    },
    select: { sku: true, price: true },
  });
  const out = new Map<string, { sku: string; price: number | null }>();
  for (const row of rows) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const key = skuKey(sku);
    const price = Number(row.price);
    const existing = out.get(key);
    if (existing?.price != null) continue;
    out.set(key, { sku, price: Number.isFinite(price) && price > 0 ? price : null });
  }
  return out;
}

export async function checkOrderAvailability(
  companyId: string,
  requestLines: RequestLine[],
): Promise<OrderAvailabilityResponse> {
  const normalized = normalizeRequestLines(requestLines);
  if (!normalized.ok) throw new OrderAvailabilityInputError(normalized.error);

  const erp2 = (await resolveTransferSlots(companyId)).erp2;
  if (!erp2) throw new OsfErpError("ERP2 is not configured");
  const cfg = erp2.cfg;

  const warehousesByCompany = new Map<string, string[]>();
  const shopWarehousesByCompany = new Map<string, string[]>();
  const [warehouseRows, priorityRows] = await Promise.all([
    listTransferWarehouses(cfg),
    loadPriorityWarehouseRows(companyId),
  ]);
  for (const row of warehouseRows) {
    const target = isMainWarehouseName(row.name)
      ? warehousesByCompany
      : isShopWarehouseName(row.name)
        ? shopWarehousesByCompany
        : null;
    if (!target) continue;
    const list = target.get(row.company) ?? [];
    list.push(row.name);
    target.set(row.company, list);
  }
  const companies = [...warehousesByCompany.keys()];
  const warehouses = [...warehousesByCompany.values(), ...shopWarehousesByCompany.values()].flat();
  const warehousePriority = toPriorityMap(priorityRows);

  const toYmd = formatAppIsoDate(new Date());
  const fromYmd = `${toYmd.slice(0, 7)}-01`;
  const config = readOrderAvailabilityConfig();

  const local = await localItems(
    companyId,
    normalized.lines.map((line) => line.sku),
  );
  const lookupCodes = normalized.lines.flatMap((line) => {
    const localSku = local.get(line.key)?.sku;
    return localSku && localSku !== line.sku ? [line.sku, localSku] : [line.sku];
  });

  const salesPromise = fetchMtdSalesByCompany(cfg, companies, fromYmd, toYmd);
  // Avoid an unhandled rejection while the stock reads run; the result is read below.
  salesPromise.catch(() => undefined);

  const commonQueries = normalized.lines.filter((line) => !isVariantSku(line.sku)).map((line) => line.sku);
  const [exactItems, commonItems] = await Promise.all([
    fetchItems(cfg, lookupCodes),
    fetchCommonSkuItems(cfg, commonQueries),
  ]);
  const items = new Map(exactItems);
  for (const [key, item] of commonItems) {
    if (!items.has(key)) items.set(key, item);
  }

  const expanded = expandCommonSkuLines(normalized.lines, items.values());
  if (expanded.length > MAX_DISTINCT_SKUS) {
    throw new OrderAvailabilityInputError(
      `These SKUs expand to ${expanded.length} variants. Check up to ${MAX_DISTINCT_SKUS} at a time — search fewer common SKUs.`,
    );
  }

  const missingPriceSkus = expanded.map((line) => line.sku).filter((sku) => !local.has(skuKey(sku)));
  const localExpanded = missingPriceSkus.length > 0 ? await localItems(companyId, missingPriceSkus) : local;
  for (const [key, row] of localExpanded) {
    if (!local.has(key)) local.set(key, row);
  }

  const skuLines: SkuLine[] = expanded.map((line) => {
    const item = items.get(line.key);
    return {
      ...line,
      itemCode: item?.itemCode ?? null,
      itemName: item?.itemName ?? null,
      unitPrice: local.get(line.key)?.price ?? null,
      found: Boolean(item),
    };
  });
  const foundCodes = skuLines.flatMap((line) => (line.itemCode ? [line.itemCode] : []));
  const binAvailable = await fetchBinAvailable(cfg, warehouses, foundCodes);

  let capError: string | null = null;
  let salesByCompany: Map<string, number> | null = null;
  try {
    salesByCompany = await salesPromise;
  } catch (error) {
    capError = (error instanceof Error ? error.message : "Could not read sales invoices").slice(0, 300);
  }

  const order = computeOrderValue(skuLines);
  const ranked = rankCompanies(
    buildCompanyResults({ skuLines, warehousesByCompany, binAvailable, warehousePriority }),
  ).map((row) => ({
    ...row,
    cap: capStatus({
      limit: config.capLkr,
      usedMtd: salesByCompany?.get(row.company) ?? null,
      orderValue: order.value,
    }),
  }));
  const picked = pickOptions(ranked, config.optionCount, {
    foundCount: foundCodes.length,
    capError,
  });

  return {
    checkedAt: new Date().toISOString(),
    capMonth: toYmd.slice(0, 7),
    lines: skuLines,
    notFound: skuLines.filter((line) => !line.found).map((line) => line.sku),
    unpricedSkus: order.unpricedSkus,
    orderValue: order.value,
    orderValueIsLowerBound: order.isLowerBound,
    cap: { limit: config.capLkr, nearThreshold: config.capLkr * NEAR_CAP_RATIO, error: capError },
    priorityWarehouses: [...warehousePriority.entries()]
      .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
      .map(([warehouse, priority]) => ({ warehouse, priority })),
    companies: picked.companies,
    shopCompanies: buildCompanyResults({
      skuLines,
      warehousesByCompany: shopWarehousesByCompany,
      binAvailable,
    }).map(({ company, warehouses, lines }) => ({ company, warehouses, lines })),
    options: picked.options,
    noOptionReason: picked.noOptionReason,
  };
}
