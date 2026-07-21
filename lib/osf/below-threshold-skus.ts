import "server-only";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { isBelowReorderThreshold } from "@/lib/osf/threshold";
import { prisma } from "@/lib/prisma";

export type BelowThresholdSku = {
  sku: string;
  productTitle: string;
  totalStock: number;
  totalRop: number;
  stockPctOfRop: number;
  thresholdPercent: number;
};

/**
 * List SKUs whose total stock / total ROP is below the SKU reorder threshold %.
 * Uses live ERP bins (same source as OSF generate).
 */
export async function listBelowThresholdSkus(
  companyId: string,
  opts?: { limit?: number },
): Promise<BelowThresholdSku[]> {
  const limit = opts?.limit ?? 500;
  const [columns, profiles, ropRows, catalog] = await Promise.all([
    resolveOsfColumns(companyId),
    prisma.productOsfProfile.findMany({ where: { companyId } }),
    prisma.productOsfRop.findMany({ where: { companyId } }),
    prisma.productItem.findMany({
      where: { companyId, sku: { not: null }, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      select: { sku: true, productTitle: true },
    }),
  ]);

  const stockCols = columns.filter((c) => c.active && c.includeInStock);
  const ropCols = columns.filter((c) => c.active && c.includeInRop);
  if (stockCols.length === 0 || ropCols.length === 0) return [];

  const bySku = new Map<string, string>();
  for (const row of catalog) {
    const sku = row.sku?.trim();
    if (!sku || bySku.has(sku)) continue;
    bySku.set(sku, row.productTitle);
  }
  const skus = [...bySku.keys()];
  if (skus.length === 0) return [];

  const profileBySku = new Map(profiles.map((p) => [p.sku, p]));
  const ropsBySku = new Map<string, Record<string, number>>();
  for (const r of ropRows) {
    const map = ropsBySku.get(r.sku) ?? {};
    map[r.columnKey] = r.ropQty;
    ropsBySku.set(r.sku, map);
  }

  const warehousesByInstance = new Map<string, Set<string>>();
  for (const col of stockCols) {
    if (!col.erpnextInstanceId) continue;
    const set = warehousesByInstance.get(col.erpnextInstanceId) ?? new Set<string>();
    for (const wh of col.warehouses) set.add(wh);
    warehousesByInstance.set(col.erpnextInstanceId, set);
  }

  const erpInstances = await getAllOsfErpInstances(companyId);
  const binMap = new Map<string, number>();
  await Promise.all(
    erpInstances.map(async (inst) => {
      const whs = [...(warehousesByInstance.get(inst.id) ?? [])];
      if (!whs.length) return;
      const bins = await fetchBinActualQty({ cfg: inst.cfg, warehouses: whs, itemCodes: skus });
      for (const [key, qty] of bins) binMap.set(key, qty);
    }),
  );

  const out: BelowThresholdSku[] = [];
  for (const sku of skus) {
    let totalStock = 0;
    for (const col of stockCols) {
      const qty = stockForColumn(binMap, col.warehouses, sku);
      if (qty != null) totalStock += qty;
    }
    const rops = ropsBySku.get(sku) ?? {};
    let totalRop = 0;
    for (const col of ropCols) {
      const r = rops[col.key];
      if (r != null && Number.isFinite(r)) totalRop += r;
    }
    const threshold = profileBySku.get(sku)?.reorderThresholdPercent ?? null;
    if (!isBelowReorderThreshold(totalStock, totalRop, threshold)) continue;
    const effective =
      threshold != null && threshold >= 1 && threshold <= 100 ? threshold : 70;
    out.push({
      sku,
      productTitle: bySku.get(sku) ?? sku,
      totalStock,
      totalRop,
      stockPctOfRop: Math.round((totalStock / totalRop) * 10000) / 100,
      thresholdPercent: effective,
    });
    if (out.length >= limit) break;
  }

  return out;
}
