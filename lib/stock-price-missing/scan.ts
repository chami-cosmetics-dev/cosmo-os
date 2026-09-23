import "server-only";

import { loadStandardAndOgfPrices, fetchItemBrandsBySku } from "@/lib/stock-price-missing/erp-selling-prices";
import {
  fetchPositiveBinsByWarehouses,
  getAllOsfErpInstances,
  OsfErpError,
  stockForColumn,
  type OsfErpCredentials,
  type OsfErpInstance,
} from "@/lib/osf/erp-stock";
import { resolveOsfColumns, type OsfResolvedColumn } from "@/lib/osf/column-config";
import { isDiscontinueErpPriority } from "@/lib/osf/discontinued";
import { isVatErpPriority } from "@/lib/osf/vat-membership";
import { prisma } from "@/lib/prisma";
import {
  classifyPriceGapForBrand,
} from "@/lib/stock-price-missing/brand-ogf-rules";
import { classifyPriceGap } from "@/lib/stock-price-missing/gap";
import {
  fetchErpProductPriorities,
  normalizeSkuKey,
} from "@/lib/product-items/erp-priority-sync";
import type {
  StockPriceMissingErpSection,
  StockPriceMissingLocationStock,
  StockPriceMissingRow,
  StockPriceMissingScanSummary,
} from "@/lib/stock-price-missing/build-content";
import type { SellingPricesBySku } from "@/lib/stock-price-missing/erp-selling-prices";

export type { StockPriceMissingRow, StockPriceMissingScanSummary };
export { classifyPriceGap, classifyPriceGapForBrand };

/**
 * Cosmetics.lk labels are "ERP_1 - Main" / "ERP_2 - Main", but createdAt
 * order can put ERP_2 first. Prefer label number over createdAt.
 */
export function pickErp1Erp2Instances(instances: OsfErpInstance[]): {
  erp1: OsfErpInstance;
  erp2: OsfErpInstance;
} {
  if (instances.length < 2) {
    throw new OsfErpError("Company needs at least two ERP instances for this report");
  }
  const byNum = (n: 1 | 2) =>
    instances.find((i) => {
      const m = i.label?.match(/erp[_\s-]*([12])\b/i);
      return m?.[1] === String(n);
    });
  const erp1 = byNum(1) ?? instances[0]!;
  const erp2 = byNum(2) ?? instances.find((i) => i.id !== erp1.id) ?? instances[1]!;
  if (erp1.id === erp2.id) {
    throw new OsfErpError("Could not resolve distinct ERP1 and ERP2 instances");
  }
  return { erp1, erp2 };
}

const BIN_PAGE = 500;
const MAX_BIN_PAGES = 200;

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

export async function fetchPositiveStockTotalsByItem(
  cfg: OsfErpCredentials,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const filters = JSON.stringify([["actual_qty", ">", 0]]);
  const fields = JSON.stringify(["item_code", "actual_qty"]);

  for (let page = 0; page < MAX_BIN_PAGES; page++) {
    const start = page * BIN_PAGE;
    const path =
      `/api/resource/Bin?filters=${encodeURIComponent(filters)}` +
      `&fields=${encodeURIComponent(fields)}` +
      `&limit_start=${start}&limit_page_length=${BIN_PAGE}`;
    const json = await erpGetJson<{
      data?: Array<{ item_code?: string; actual_qty?: number }>;
    }>(cfg, path);
    const rows = json.data ?? [];
    for (const row of rows) {
      const sku = row.item_code?.trim();
      if (!sku) continue;
      const qty = Number(row.actual_qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      map.set(sku, (map.get(sku) ?? 0) + qty);
    }
    if (rows.length < BIN_PAGE) break;
  }

  return map;
}

function locationsForSku(input: {
  sku: string;
  stockCols: OsfResolvedColumn[];
  binMaps: Map<string, Map<string, number>>;
  defaultInstanceId: string;
}): StockPriceMissingLocationStock[] {
  const locations: StockPriceMissingLocationStock[] = [];
  for (const col of input.stockCols) {
    const instanceId = col.erpnextInstanceId ?? input.defaultInstanceId;
    const binMap = input.binMaps.get(instanceId);
    if (!binMap) continue;
    const qty = stockForColumn(binMap, col.warehouses, input.sku) ?? 0;
    if (!(qty > 0)) continue;
    const label = col.label || col.companyLocationName || col.key;
    const existing = locations.find((l) => l.locationLabel === label);
    if (existing) existing.stock += qty;
    else locations.push({ locationLabel: label, stock: qty });
  }
  locations.sort((a, b) => a.locationLabel.localeCompare(b.locationLabel));
  return locations;
}

async function loadBinMaps(input: {
  stockCols: OsfResolvedColumn[];
  instances: OsfErpInstance[];
  defaultInstanceId: string;
}): Promise<Map<string, Map<string, number>>> {
  const instanceById = new Map(input.instances.map((i) => [i.id, i]));
  const warehousesByInstance = new Map<string, Set<string>>();

  for (const col of input.stockCols) {
    const instanceId = col.erpnextInstanceId ?? input.defaultInstanceId;
    if (!instanceById.has(instanceId)) continue;
    let set = warehousesByInstance.get(instanceId);
    if (!set) {
      set = new Set();
      warehousesByInstance.set(instanceId, set);
    }
    for (const wh of col.warehouses) set.add(wh);
  }

  const binMaps = new Map<string, Map<string, number>>();
  await Promise.all(
    [...warehousesByInstance.entries()].map(async ([instanceId, whSet]) => {
      const inst = instanceById.get(instanceId);
      if (!inst) return;
      const bins = await fetchPositiveBinsByWarehouses({
        cfg: inst.cfg,
        warehouses: [...whSet],
      });
      binMaps.set(instanceId, bins);
    }),
  );
  return binMaps;
}

function buildErpSection(input: {
  label: string;
  erp: "erp1" | "erp2";
  stockBySku: Map<string, number>;
  prices: SellingPricesBySku;
  stockCols: OsfResolvedColumn[];
  binMaps: Map<string, Map<string, number>>;
  instanceId: string;
  nameBySku: Map<string, string>;
  brandBySku: Map<string, string | null>;
  /** When set, skip these SKUs (e.g. VAT items on ERP2). */
  excludeSkus?: Set<string>;
}): StockPriceMissingErpSection {
  const rows: StockPriceMissingRow[] = [];
  let missingStandardCount = 0;
  let missingOgfCount = 0;
  let missingBothCount = 0;

  const skus = [...input.stockBySku.keys()].sort((a, b) => a.localeCompare(b));
  for (const sku of skus) {
    if (input.excludeSkus?.has(sku)) continue;
    const stock = input.stockBySku.get(sku) ?? 0;
    if (!(stock > 0)) continue;

    const standardRate = input.prices.standard[sku] ?? null;
    const ogfRate = input.prices.ogf[sku] ?? null;
    const gap = classifyPriceGapForBrand({
      hasStandard: Boolean(standardRate),
      hasOgf: Boolean(ogfRate),
      brand: input.brandBySku.get(sku) ?? null,
      erp: input.erp,
    });
    if (!gap) continue;

    if (gap === "Standard") missingStandardCount += 1;
    else if (gap === "OGF") missingOgfCount += 1;
    else missingBothCount += 1;

    const locations = locationsForSku({
      sku,
      stockCols: input.stockCols,
      binMaps: input.binMaps,
      defaultInstanceId: input.instanceId,
    });
    const totalStock =
      locations.length > 0
        ? locations.reduce((sum, l) => sum + l.stock, 0)
        : stock;

    rows.push({
      sku,
      itemName: input.nameBySku.get(sku) ?? sku,
      locations,
      totalStock,
      standardRate,
      ogfRate,
      gap,
    });
  }

  return {
    label: input.label,
    rows,
    missingStandardCount,
    missingOgfCount,
    missingBothCount,
  };
}

/**
 * ERP1 + ERP2 sections.
 * Standard Selling required for all items.
 * OGF: ERP1 only Cerave; ERP2 all brands except skip-list (Acnes…Cerave).
 * Live ERP Product Priority: exclude Discontinue on that ERP; ERP2 also excludes Vat.
 * VAT - Selling price list ignored.
 */
export async function scanStockPriceMissing(
  companyId: string,
): Promise<StockPriceMissingScanSummary> {
  const [columns, instances] = await Promise.all([
    resolveOsfColumns(companyId),
    getAllOsfErpInstances(companyId),
  ]);

  if (instances.length < 2) {
    throw new OsfErpError("Company needs at least two ERP instances for this report");
  }

  const { erp1, erp2 } = pickErp1Erp2Instances(instances);

  const [stock1, stock2, prices1, prices2, priorities1, priorities2] = await Promise.all([
    fetchPositiveStockTotalsByItem(erp1.cfg),
    fetchPositiveStockTotalsByItem(erp2.cfg),
    loadStandardAndOgfPrices(erp1.cfg),
    loadStandardAndOgfPrices(erp2.cfg),
    fetchErpProductPriorities(erp1.cfg),
    fetchErpProductPriorities(erp2.cfg),
  ]);

  const stockCols = columns.filter(
    (c) => c.active && c.includeInStock && c.warehouses.length > 0,
  );
  const binMaps = await loadBinMaps({
    stockCols,
    instances,
    defaultInstanceId: erp1.id,
  });

  const allSkus = [
    ...new Set([...stock1.keys(), ...stock2.keys()]),
  ];
  const [catalog, brands1, brands2] = await Promise.all([
    loadItemCatalog(companyId, allSkus),
    fetchItemBrandsBySku(erp1.cfg, [...stock1.keys()]),
    fetchItemBrandsBySku(erp2.cfg, [...stock2.keys()]),
  ]);

  const erp1Cols = stockCols.filter(
    (c) => (c.erpnextInstanceId ?? erp1.id) === erp1.id,
  );
  const erp2Cols = stockCols.filter(
    (c) => (c.erpnextInstanceId ?? erp1.id) === erp2.id,
  );

  const erp1Exclude = excludeSkusFromPriorities({
    skus: [...stock1.keys()],
    bySku: priorities1.bySku,
    dropDiscontinue: true,
    dropVat: false,
  });
  const erp2Exclude = excludeSkusFromPriorities({
    skus: [...stock2.keys()],
    bySku: priorities2.bySku,
    dropDiscontinue: true,
    dropVat: true,
  });

  return {
    companyId,
    erp1: buildErpSection({
      label: erp1.label?.trim() || "ERP1",
      erp: "erp1",
      stockBySku: stock1,
      prices: prices1,
      stockCols: erp1Cols.length > 0 ? erp1Cols : stockCols,
      binMaps,
      instanceId: erp1.id,
      nameBySku: catalog.nameBySku,
      brandBySku: mergeBrandMaps(brands1, catalog.brandBySku),
      excludeSkus: erp1Exclude,
    }),
    erp2: buildErpSection({
      label: erp2.label?.trim() || "ERP2",
      erp: "erp2",
      stockBySku: stock2,
      prices: prices2,
      stockCols: erp2Cols.length > 0 ? erp2Cols : stockCols,
      binMaps,
      instanceId: erp2.id,
      nameBySku: catalog.nameBySku,
      brandBySku: mergeBrandMaps(brands2, catalog.brandBySku),
      excludeSkus: erp2Exclude,
    }),
  };
}

/** Prefer ERP Item.brand; fall back to Cosmo vendor name. */
function mergeBrandMaps(
  erpBrands: Map<string, string | null>,
  fallback: Map<string, string | null>,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const [sku, brand] of erpBrands) {
    out.set(sku, brand || fallback.get(sku) || null);
  }
  for (const [sku, brand] of fallback) {
    if (!out.has(sku)) out.set(sku, brand);
  }
  return out;
}

export function excludeSkusFromPriorities(input: {
  skus: string[];
  bySku: Map<string, string | null>;
  dropDiscontinue: boolean;
  dropVat: boolean;
}): Set<string> {
  const out = new Set<string>();
  for (const sku of input.skus) {
    const priority = input.bySku.get(normalizeSkuKey(sku)) ?? null;
    if (input.dropDiscontinue && isDiscontinueErpPriority(priority)) {
      out.add(sku);
      continue;
    }
    if (input.dropVat && isVatErpPriority(priority)) {
      out.add(sku);
    }
  }
  return out;
}

async function loadItemCatalog(
  companyId: string,
  skus: string[],
): Promise<{
  nameBySku: Map<string, string>;
  brandBySku: Map<string, string | null>;
}> {
  const nameBySku = new Map<string, string>();
  const brandBySku = new Map<string, string | null>();
  const unique = [...new Set(skus)];
  if (unique.length === 0) return { nameBySku, brandBySku };

  const chunkSize = 400;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const nameRows = await prisma.productItem.findMany({
      where: { companyId, sku: { in: chunk } },
      select: {
        sku: true,
        productTitle: true,
        variantTitle: true,
        vendor: { select: { name: true } },
      },
    });
    for (const r of nameRows) {
      const sku = r.sku?.trim();
      if (!sku) continue;
      if (!nameBySku.has(sku)) {
        const title = [r.productTitle, r.variantTitle].filter(Boolean).join(" — ").trim();
        nameBySku.set(sku, title || sku);
      }
      if (!brandBySku.has(sku)) {
        brandBySku.set(sku, r.vendor?.name?.trim() || null);
      }
    }
  }
  return { nameBySku, brandBySku };
}
