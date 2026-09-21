import "server-only";

import {
  loadLwkStickerPricesBySku,
  loadStandardSellingPricesBySku,
} from "@/lib/sticker-lwk-erp-price";
import {
  fetchPositiveBinsByWarehouses,
  getAllOsfErpInstances,
  OsfErpError,
  stockForColumn,
  type OsfErpCredentials,
  type OsfErpInstance,
} from "@/lib/osf/erp-stock";
import { resolveOsfColumns, type OsfResolvedColumn } from "@/lib/osf/column-config";
import { isVatErpPriority } from "@/lib/osf/vat-membership";
import { prisma } from "@/lib/prisma";
import type {
  StockPriceMissingLocationStock,
  StockPriceMissingRow,
  StockPriceMissingScanSummary,
} from "@/lib/stock-price-missing/build-content";

export type { StockPriceMissingRow, StockPriceMissingScanSummary };

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

/** Sum actual_qty > 0 across all warehouses, keyed by item_code. */
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

/**
 * 1) Both ERPs stock + no Standard + no OGF.
 * 2) ERP2 stock + Standard present + OGF missing + not VAT.
 */
export async function scanStockPriceMissing(
  companyId: string,
): Promise<StockPriceMissingScanSummary> {
  const [columns, instances, standardPrices, ogfPrices] = await Promise.all([
    resolveOsfColumns(companyId),
    getAllOsfErpInstances(companyId),
    loadStandardSellingPricesBySku(companyId),
    loadLwkStickerPricesBySku(companyId),
  ]);

  if (instances.length < 2) {
    throw new OsfErpError("Company needs at least two ERP instances for this report");
  }

  const erp1 = instances[0]!;
  const erp2 = instances[1]!;

  const [stock1, stock2] = await Promise.all([
    fetchPositiveStockTotalsByItem(erp1.cfg),
    fetchPositiveStockTotalsByItem(erp2.cfg),
  ]);

  const bothErpNoPriceSkus: string[] = [];
  for (const [sku, qty1] of stock1) {
    const qty2 = stock2.get(sku) ?? 0;
    if (qty1 > 0 && qty2 > 0 && !standardPrices[sku] && !ogfPrices[sku]) {
      bothErpNoPriceSkus.push(sku);
    }
  }
  bothErpNoPriceSkus.sort((a, b) => a.localeCompare(b));

  const erp2OgfCandidateSkus: string[] = [];
  for (const [sku, qty2] of stock2) {
    if (!(qty2 > 0)) continue;
    if (!standardPrices[sku]) continue;
    if (ogfPrices[sku]) continue;
    erp2OgfCandidateSkus.push(sku);
  }
  erp2OgfCandidateSkus.sort((a, b) => a.localeCompare(b));

  const vatBySku = await loadVatFlags(companyId, erp2OgfCandidateSkus);
  const erp2OgfMissingSkus = erp2OgfCandidateSkus.filter((sku) => !vatBySku.get(sku));

  const stockCols = columns.filter(
    (c) => c.active && c.includeInStock && c.warehouses.length > 0,
  );
  const needLocations =
    bothErpNoPriceSkus.length > 0 || erp2OgfMissingSkus.length > 0;
  const binMaps = needLocations
    ? await loadBinMaps({
        stockCols,
        instances,
        defaultInstanceId: erp1.id,
      })
    : new Map<string, Map<string, number>>();

  const nameBySku = await loadItemNames(companyId, [
    ...bothErpNoPriceSkus,
    ...erp2OgfMissingSkus,
  ]);

  const rows: StockPriceMissingRow[] = bothErpNoPriceSkus.map((sku) => {
    const locations = locationsForSku({
      sku,
      stockCols,
      binMaps,
      defaultInstanceId: erp1.id,
    });
    const totalStock =
      locations.length > 0
        ? locations.reduce((sum, l) => sum + l.stock, 0)
        : (stock1.get(sku) ?? 0) + (stock2.get(sku) ?? 0);
    return {
      sku,
      itemName: nameBySku.get(sku) ?? sku,
      locations,
      totalStock,
      standardRate: null,
      ogfRate: null,
      gap: "Both" as const,
    };
  });

  /** Prefer ERP2-linked OSF columns for location breakdown. */
  const erp2StockCols = stockCols.filter(
    (c) => (c.erpnextInstanceId ?? erp1.id) === erp2.id,
  );
  const locationColsForErp2 = erp2StockCols.length > 0 ? erp2StockCols : stockCols;

  const erp2OgfMissingRows: StockPriceMissingRow[] = erp2OgfMissingSkus.map((sku) => {
    const locations = locationsForSku({
      sku,
      stockCols: locationColsForErp2,
      binMaps,
      defaultInstanceId: erp2.id,
    });
    const totalStock =
      locations.length > 0
        ? locations.reduce((sum, l) => sum + l.stock, 0)
        : (stock2.get(sku) ?? 0);
    return {
      sku,
      itemName: nameBySku.get(sku) ?? sku,
      locations,
      totalStock,
      standardRate: standardPrices[sku] ?? null,
      ogfRate: null,
      gap: "OGF" as const,
    };
  });

  return {
    companyId,
    rows,
    erp2OgfMissingRows,
    missingStandardCount: 0,
    missingOgfCount: erp2OgfMissingRows.length,
    missingBothCount: rows.length,
    erp2OgfMissingCount: erp2OgfMissingRows.length,
  };
}

async function loadVatFlags(
  companyId: string,
  skus: string[],
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (skus.length === 0) return out;

  const chunkSize = 400;
  for (let i = 0; i < skus.length; i += chunkSize) {
    const chunk = skus.slice(i, i + chunkSize);
    const rows = await prisma.productItem.findMany({
      where: { companyId, sku: { in: chunk } },
      select: {
        sku: true,
        erp1ProductPriority: true,
        erp2ProductPriority: true,
      },
    });
    for (const r of rows) {
      const sku = r.sku?.trim();
      if (!sku) continue;
      const isVat =
        isVatErpPriority(r.erp1ProductPriority) || isVatErpPriority(r.erp2ProductPriority);
      if (isVat) out.set(sku, true);
      else if (!out.has(sku)) out.set(sku, false);
    }
  }
  return out;
}

async function loadItemNames(
  companyId: string,
  skus: string[],
): Promise<Map<string, string>> {
  const nameBySku = new Map<string, string>();
  const unique = [...new Set(skus)];
  if (unique.length === 0) return nameBySku;

  const chunkSize = 400;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const nameRows = await prisma.productItem.findMany({
      where: { companyId, sku: { in: chunk } },
      select: { sku: true, productTitle: true, variantTitle: true },
    });
    for (const r of nameRows) {
      const sku = r.sku?.trim();
      if (!sku || nameBySku.has(sku)) continue;
      const title = [r.productTitle, r.variantTitle].filter(Boolean).join(" — ").trim();
      nameBySku.set(sku, title || sku);
    }
  }
  return nameBySku;
}
