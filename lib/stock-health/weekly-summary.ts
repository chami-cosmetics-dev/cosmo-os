import "server-only";

import { getLiveStockBalances } from "@/lib/item-trends/stock-balance-report";
import { resolveProductPriority } from "@/lib/osf/assist-window";
import { getAllOsfErpInstances, OsfErpError, type OsfErpCredentials } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";
import {
  resolveErpSlots,
  resolveProductPriorityFieldName,
} from "@/lib/product-items/erp-priority-sync";
import {
  commonSkuOf,
  excludingRuleOf,
  parseExcludedSkus,
  skuKey,
  summarizeByStatus,
  type ExcludedSkus,
  type StockHealthItem,
} from "@/lib/stock-health/calc";
import {
  STOCK_HEALTH_STATUSES,
  type StockHealthStatus,
  type StockHealthStatusTotals,
  type StockHealthWeeklySummary,
} from "@/lib/stock-health/config";
import { vaultErpGetJson } from "@/lib/vault-osf/erp-client";

const ITEM_PAGE = 500;
const ITEM_MAX_PAGES = 80;
const CACHE_TTL_MS = 60 * 60 * 1000;

type ErpItem = {
  sku: string;
  brand: string | null;
  priority: string | null;
  itemName: string | null;
};

/** Every Item on one ERP: item code, name, brand, Product Priority. */
async function fetchErpItems(cfg: OsfErpCredentials): Promise<ErpItem[]> {
  const priorityField = await resolveProductPriorityFieldName(cfg);
  const fields = JSON.stringify(["item_code", "item_name", "brand", priorityField].filter(Boolean));
  const items: ErpItem[] = [];
  for (let page = 0; page < ITEM_MAX_PAGES; page += 1) {
    const json = await vaultErpGetJson<{ data?: Array<Record<string, unknown>> }>(
      cfg,
      `/api/resource/Item?fields=${encodeURIComponent(fields)}` +
        `&limit_start=${page * ITEM_PAGE}&limit_page_length=${ITEM_PAGE}`,
    );
    const rows = json.data ?? [];
    for (const row of rows) {
      const sku = String(row.item_code ?? "").trim();
      if (!sku) continue;
      const brand = String(row.brand ?? "").trim();
      const priority = priorityField ? String(row[priorityField] ?? "").trim() : "";
      const itemName = String(row.item_name ?? "").trim();
      items.push({ sku, brand: brand || null, priority: priority || null, itemName: itemName || null });
    }
    if (rows.length < ITEM_PAGE) return items;
  }
  throw new OsfErpError(`ERP Item list exceeded ${ITEM_MAX_PAGES * ITEM_PAGE} rows — raise ITEM_MAX_PAGES`);
}

/**
 * Website (Shopify) product status per SKU, from the synced products. A SKU with an
 * `active` listing is active, even if another listing is a draft.
 */
async function loadSiteStatusBySku(companyId: string): Promise<Map<string, string>> {
  const rows = await prisma.productItem.findMany({
    where: { companyId, sku: { not: null }, status: { not: null } },
    select: { sku: true, status: true },
  });
  const bySku = new Map<string, string>();
  for (const row of rows) {
    const key = skuKey(row.sku!);
    const status = row.status!.trim().toLowerCase();
    if (status && bySku.get(key) !== "active") bySku.set(key, status);
  }
  return bySku;
}

/** ERP1 + ERP2 Item lists merged by SKU; priority from ERP1, else ERP2; website status. */
async function loadStockHealthItems(companyId: string): Promise<StockHealthItem[]> {
  const instances = await getAllOsfErpInstances(companyId);
  const slots = resolveErpSlots(instances);
  const erp1 = instances.find((i) => i.id === slots.erp1?.id) ?? null;
  const erp2 = instances.find((i) => i.id === slots.erp2?.id) ?? null;
  const [erp1Items, erp2Items, siteStatusBySku] = await Promise.all([
    erp1 ? fetchErpItems(erp1.cfg) : Promise.resolve([]),
    erp2 ? fetchErpItems(erp2.cfg) : Promise.resolve([]),
    loadSiteStatusBySku(companyId),
  ]);

  const erp2BySku = new Map(erp2Items.map((item) => [skuKey(item.sku), item]));
  const merged = new Map<string, StockHealthItem>();
  for (const item of erp1Items) {
    const other = erp2BySku.get(skuKey(item.sku));
    merged.set(skuKey(item.sku), {
      sku: item.sku,
      brand: item.brand ?? other?.brand ?? null,
      priority: resolveProductPriority(item.priority, other?.priority),
      siteStatus: siteStatusBySku.get(skuKey(item.sku)) ?? null,
      itemName: item.itemName ?? other?.itemName ?? null,
    });
  }
  for (const item of erp2Items) {
    if (!merged.has(skuKey(item.sku))) {
      merged.set(skuKey(item.sku), { ...item, siteStatus: siteStatusBySku.get(skuKey(item.sku)) ?? null });
    }
  }
  return [...merged.values()];
}

/** ERP warehouse name → key for matching (`warehouseKey`). */
export function warehouseKey(warehouse: string): string {
  return warehouse.trim().toLowerCase();
}

/**
 * Stock per SKU over every warehouse on every ERP ("Stock Balance Summary - Item Wise"):
 * the total, and per warehouse.
 */
async function loadStockBySku(companyId: string): Promise<{
  stockBySku: Map<string, number>;
  stockByWarehouse: Map<string, Map<string, number>>;
}> {
  const balances = await getLiveStockBalances(companyId);
  const stockBySku = new Map<string, number>();
  const stockByWarehouse = new Map<string, Map<string, number>>();
  for (const row of balances) {
    const key = skuKey(row.sku);
    stockBySku.set(key, (stockBySku.get(key) ?? 0) + row.qty);
    const byWarehouse = stockByWarehouse.get(key) ?? new Map<string, number>();
    const wh = warehouseKey(row.warehouse);
    byWarehouse.set(wh, (byWarehouse.get(wh) ?? 0) + row.qty);
    stockByWarehouse.set(key, byWarehouse);
  }
  return { stockBySku, stockByWarehouse };
}

export type LiveStockHealthData = {
  /** ERP1 + ERP2 Items merged by SKU. */
  items: StockHealthItem[];
  /** SKU key → total stock over every warehouse. */
  stockBySku: Map<string, number>;
  /** SKU key → `warehouseKey` → stock (the same rows as `stockBySku`). */
  stockByWarehouse: Map<string, Map<string, number>>;
  fetchedAt: Date;
};

const cache = new Map<string, LiveStockHealthData>();
const inFlight = new Map<string, Promise<LiveStockHealthData>>();

/**
 * Live ERP Items + stock. Cached per company until `refresh` (or the TTL), since the
 * stock report is regenerated on every build.
 */
export async function getLiveStockHealthData(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<LiveStockHealthData> {
  const cached = cache.get(companyId);
  if (!options.refresh && cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  const existing = inFlight.get(companyId);
  if (existing) return existing;

  const promise = Promise.all([loadStockHealthItems(companyId), loadStockBySku(companyId)])
    .then(([items, { stockBySku, stockByWarehouse }]) => {
      const data = { items, stockBySku, stockByWarehouse, fetchedAt: new Date() };
      cache.set(companyId, data);
      listRuleMatches(companyId).catch((error) =>
        console.error("Stock Health: listing rule-excluded SKUs failed:", error),
      );
      return data;
    })
    .finally(() => inFlight.delete(companyId));
  inFlight.set(companyId, promise);
  return promise;
}

/**
 * Excluded Common SKUs + prefix rules (edited on the screen). Read on every build — not
 * cached with the ERP data — so a change shows straight away. Common SKUs a rule catches
 * (e.g. new `BU0*` bundles) are added to the list, so the screen shows each one.
 */
export async function loadExcludedSkus(companyId: string): Promise<ExcludedSkus> {
  const excluded = await readExcludedSkus(companyId);
  await listRuleMatches(companyId, excluded);
  return excluded;
}

async function readExcludedSkus(companyId: string): Promise<ExcludedSkus> {
  const rows = await prisma.stockHealthExcludedSku.findMany({
    where: { companyId },
    select: { sku: true, countAnyway: true },
  });
  return parseExcludedSkus(
    rows.filter((row) => !row.countAnyway).map((row) => row.sku),
    rows.filter((row) => row.countAnyway).map((row) => row.sku),
  );
}

/**
 * Adds the Common SKUs a prefix rule catches (except the counted-anyway ones) to the excluded
 * list. Uses the cached ERP Items only (no ERP call); with a cold cache this waits for the
 * next build.
 */
export async function listRuleMatches(companyId: string, excluded?: ExcludedSkus) {
  const items = cache.get(companyId)?.items;
  if (!items) return;
  const rules = excluded ?? (await readExcludedSkus(companyId));
  if (rules.prefixes.length === 0) return;

  const missing = new Set<string>();
  for (const item of items) {
    const key = commonSkuOf(item);
    if (key && !rules.exact.has(key) && !rules.countAnyway.has(key) && excludingRuleOf(key, rules)) {
      missing.add(key);
    }
  }
  if (missing.size === 0) return;
  await prisma.stockHealthExcludedSku.createMany({
    data: [...missing].map((sku) => ({ companyId, sku })),
    skipDuplicates: true,
  });
}

/** Live count + stock per status (from the cached live data). */
async function getLiveStockHealthTotals(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<{ rows: StockHealthStatusTotals[]; fetchedAt: Date }> {
  const [data, excluded] = await Promise.all([
    getLiveStockHealthData(companyId, options),
    loadExcludedSkus(companyId),
  ]);
  return {
    rows: summarizeByStatus(data.items, data.stockBySku, excluded),
    fetchedAt: data.fetchedAt,
  };
}

/** True when the YYYY-MM-DD date is a Monday. */
export function isMonday(isoDate: string): boolean {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay() === 1;
}

/**
 * Upserts of one Monday's snapshot (one row per status). Saved by the Monday summary mail,
 * in the same transaction that marks it sent; re-saving the same day overwrites it.
 */
export function stockHealthSnapshotWrites(
  companyId: string,
  snapshotDate: string,
  rows: StockHealthStatusTotals[],
) {
  return rows.map((row) =>
    prisma.stockHealthWeeklySnapshot.upsert({
      where: {
        companyId_snapshotDate_status: { companyId, snapshotDate, status: row.status },
      },
      create: { companyId, snapshotDate, status: row.status, count: row.count, stock: row.stock },
      update: { count: row.count, stock: row.stock },
    }),
  );
}

/**
 * Writes each counted Common SKU's priority for one Monday (replacing that day's rows), in the
 * same transaction as the totals — next Monday's mail compares against it (Discontinue moves).
 */
export function stockHealthSkuSnapshotWrites(
  companyId: string,
  snapshotDate: string,
  rows: Array<{ commonSku: string; status: StockHealthStatus; itemName: string | null }>,
) {
  return [
    prisma.stockHealthSkuSnapshot.deleteMany({ where: { companyId, snapshotDate } }),
    prisma.stockHealthSkuSnapshot.createMany({
      data: rows.map((row) => ({ companyId, snapshotDate, ...row })),
      skipDuplicates: true,
    }),
  ];
}

/** Each Common SKU's priority saved on that Monday; empty when none was saved. */
export async function loadStockHealthSkuSnapshot(
  companyId: string,
  snapshotDate: string,
): Promise<Array<{ commonSku: string; status: StockHealthStatus; itemName: string | null }>> {
  const rows = await prisma.stockHealthSkuSnapshot.findMany({
    where: { companyId, snapshotDate },
    select: { commonSku: true, status: true, itemName: true },
  });
  return rows.map((row) => ({
    commonSku: row.commonSku,
    status: (STOCK_HEALTH_STATUSES as readonly string[]).includes(row.status)
      ? (row.status as StockHealthStatus)
      : "Blank",
    itemName: row.itemName,
  }));
}

/** The last snapshot saved before beforeDate (YYYY-MM-DD), or null when there is none. */
export async function loadPreviousStockHealthSnapshot(
  companyId: string,
  beforeDate: string,
): Promise<{ snapshotDate: string; rows: StockHealthStatusTotals[] } | null> {
  const latest = await prisma.stockHealthWeeklySnapshot.findFirst({
    where: { companyId, snapshotDate: { lt: beforeDate } },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  if (!latest) return null;
  const saved = await prisma.stockHealthWeeklySnapshot.findMany({
    where: { companyId, snapshotDate: latest.snapshotDate },
    select: { status: true, count: true, stock: true },
  });
  return {
    snapshotDate: latest.snapshotDate,
    rows: STOCK_HEALTH_STATUSES.map((status) => {
      const row = saved.find((s) => s.status === status);
      return { status, count: row?.count ?? 0, stock: row?.stock ?? 0 };
    }),
  };
}

/**
 * The latest two Monday snapshots compared, or — until there are two — live figures.
 */
export async function loadStockHealthWeeklySummary(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<StockHealthWeeklySummary> {
  const dates = await prisma.stockHealthWeeklySnapshot.findMany({
    where: { companyId },
    distinct: ["snapshotDate"],
    orderBy: { snapshotDate: "desc" },
    take: 2,
    select: { snapshotDate: true },
  });

  if (dates.length < 2) {
    const live = await getLiveStockHealthTotals(companyId, options);
    return {
      mode: "current",
      rows: live.rows.filter((row) => row.status !== "Blank" || row.count > 0),
      fetchedAt: live.fetchedAt.toISOString(),
    };
  }

  const [currentDate, previousDate] = dates.map((d) => d.snapshotDate);
  const snapshots = await prisma.stockHealthWeeklySnapshot.findMany({
    where: { companyId, snapshotDate: { in: [currentDate, previousDate] } },
    select: { snapshotDate: true, status: true, count: true, stock: true },
  });
  const pick = (date: string, status: StockHealthStatus) => {
    const row = snapshots.find((s) => s.snapshotDate === date && s.status === status);
    return { count: row?.count ?? 0, stock: row?.stock ?? 0 };
  };

  return {
    mode: "weekly",
    previousDate,
    currentDate,
    rows: STOCK_HEALTH_STATUSES.map((status) => {
      const previous = pick(previousDate, status);
      const current = pick(currentDate, status);
      return {
        status,
        previous,
        current,
        change: { count: current.count - previous.count, stock: current.stock - previous.stock },
      };
    }).filter(
      // Blank only when it has Common SKUs in either week.
      (row) => row.status !== "Blank" || row.previous.count > 0 || row.current.count > 0,
    ),
  };
}
