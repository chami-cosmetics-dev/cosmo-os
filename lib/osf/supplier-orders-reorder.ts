import "server-only";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { orderQty, sumSignedOrderQtysFlooredAtZero } from "@/lib/osf/formulas";
import { prisma } from "@/lib/prisma";

/**
 * TOTAL ORDER QTY per SKU (OSF Main sheet aggregate): per-column orderQty, signed sum floored at 0.
 * Returns 0 for SKUs that cannot be computed (missing columns/stock/ROP).
 */
export async function computeTotalOrderQtyForSkus(
  companyId: string,
  skus: string[],
): Promise<Map<string, number>> {
  const uniqueSkus = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  const result = new Map<string, number>();
  for (const sku of uniqueSkus) {
    result.set(sku, 0);
  }
  if (uniqueSkus.length === 0) return result;

  const [columns, ropRows] = await Promise.all([
    resolveOsfColumns(companyId),
    prisma.productOsfRop.findMany({
      where: { companyId, sku: { in: uniqueSkus } },
    }),
  ]);

  const stockCols = columns.filter((c) => c.active && c.includeInStock);
  const ropCols = columns.filter((c) => c.active && c.includeInRop);
  if (stockCols.length === 0 || ropCols.length === 0) return result;

  const ropsBySku = new Map<string, Record<string, number>>();
  for (const row of ropRows) {
    const map = ropsBySku.get(row.sku) ?? {};
    map[row.columnKey] = row.ropQty;
    ropsBySku.set(row.sku, map);
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
      const bins = await fetchBinActualQty({ cfg: inst.cfg, warehouses: whs, itemCodes: uniqueSkus });
      for (const [key, qty] of bins) binMap.set(key, qty);
    }),
  );

  for (const sku of uniqueSkus) {
    const rops = ropsBySku.get(sku) ?? {};
    const orderVals: Array<number | null> = [];

    for (const col of stockCols) {
      const ropCol = ropCols.find((r) => r.key === col.key);
      const ropVal = ropCol ? (rops[col.key] ?? null) : null;
      const stock = stockForColumn(binMap, col.warehouses, sku);
      orderVals.push(orderQty(ropVal, stock));
    }

    result.set(sku, sumSignedOrderQtysFlooredAtZero(orderVals));
  }

  return result;
}
