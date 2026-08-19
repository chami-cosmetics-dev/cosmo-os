import "server-only";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { isBelowReorderThreshold } from "@/lib/osf/threshold";
import { prisma } from "@/lib/prisma";

export type BelowThresholdSku = {
  sku: string;
  productTitle: string;
  brand: string | null;
  shopAvailability: string | null;
  ogfPrice: number | null;
  reorderThresholdPercent: number | null;
  rops: Record<string, number>;
  totalStock: number;
  totalRop: number;
  stockPctOfRop: number;
  thresholdPercent: number;
};

/**
 * List SKUs whose total stock / total ROP is below a cutoff %.
 * Cutoff is `maxPercent` when given, else each SKU’s reorder threshold (default 70).
 * Only SKUs with assigned ROP (total ROP > 0). Live ERP bins, same as OSF generate.
 */
export async function listBelowThresholdSkus(
  companyId: string,
  opts?: { limit?: number; maxPercent?: number; q?: string },
): Promise<BelowThresholdSku[]> {
  const limit = opts?.limit ?? 500;
  const q = opts?.q?.trim().toLowerCase() ?? "";
  const [columns, profiles, ropRows, catalog] = await Promise.all([
    resolveOsfColumns(companyId),
    prisma.productOsfProfile.findMany({ where: { companyId } }),
    prisma.productOsfRop.findMany({ where: { companyId } }),
    prisma.productItem.findMany({
      where: { companyId, sku: { not: null }, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      select: { sku: true, productTitle: true, vendor: { select: { name: true } } },
    }),
  ]);

  const stockCols = columns.filter((c) => c.active && c.includeInStock);
  const ropCols = columns.filter((c) => c.active && c.includeInRop);
  if (stockCols.length === 0 || ropCols.length === 0) return [];

  const bySku = new Map<string, { productTitle: string; brand: string | null }>();
  for (const row of catalog) {
    const sku = row.sku?.trim();
    if (!sku || bySku.has(sku)) continue;
    bySku.set(sku, {
      productTitle: row.productTitle,
      brand: row.vendor?.name ?? null,
    });
  }

  const profileBySku = new Map(profiles.map((p) => [p.sku, p]));
  const ropsBySku = new Map<string, Record<string, number>>();
  for (const r of ropRows) {
    const map = ropsBySku.get(r.sku) ?? {};
    map[r.columnKey] = r.ropQty;
    ropsBySku.set(r.sku, map);
  }

  const skus: string[] = [];
  for (const sku of bySku.keys()) {
    const catalogRow = bySku.get(sku)!;
    if (q) {
      const hay = `${sku} ${catalogRow.productTitle}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    const rops = ropsBySku.get(sku) ?? {};
    let totalRop = 0;
    for (const col of ropCols) {
      const r = rops[col.key];
      if (r != null && Number.isFinite(r)) totalRop += r;
    }
    if (totalRop > 0) skus.push(sku);
  }
  if (skus.length === 0) return [];

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
    const profile = profileBySku.get(sku);
    const cutoff =
      opts?.maxPercent != null ? opts.maxPercent : (profile?.reorderThresholdPercent ?? null);
    if (!isBelowReorderThreshold(totalStock, totalRop, cutoff)) continue;
    const effective =
      cutoff != null && cutoff >= 1 && cutoff <= 100 ? cutoff : 70;
    const catalogRow = bySku.get(sku);
    out.push({
      sku,
      productTitle: catalogRow?.productTitle ?? sku,
      brand: catalogRow?.brand ?? null,
      shopAvailability: profile?.shopAvailability ?? null,
      ogfPrice: profile?.ogfPrice != null ? Number(profile.ogfPrice) : null,
      reorderThresholdPercent: profile?.reorderThresholdPercent ?? null,
      rops,
      totalStock,
      totalRop,
      stockPctOfRop: Math.round((totalStock / totalRop) * 10000) / 100,
      thresholdPercent: effective,
    });
    if (opts?.maxPercent == null && out.length >= limit) break;
  }

  if (opts?.maxPercent != null) {
    out.sort((a, b) => a.stockPctOfRop - b.stockPctOfRop);
    return out.slice(0, limit);
  }

  return out;
}
