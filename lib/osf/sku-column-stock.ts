import "server-only";

import { resolveOsfColumns } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { orderQty } from "@/lib/osf/formulas";
import { prisma } from "@/lib/prisma";

export type SkuColumnStockRow = {
  key: string;
  label: string;
  stock: number | null;
  rop: number | null;
  reorderQty: number | null;
};

/**
 * Live ERP Bin stock + reorder qty (ROP − stock) per active ROP column for one SKU.
 */
export async function fetchSkuColumnLiveStock(
  companyId: string,
  sku: string,
): Promise<SkuColumnStockRow[]> {
  const trimmed = sku.trim();
  if (!trimmed) return [];

  const [columns, ropRows] = await Promise.all([
    resolveOsfColumns(companyId),
    prisma.productOsfRop.findMany({
      where: { companyId, sku: trimmed },
    }),
  ]);

  const ropCols = columns.filter((c) => c.active && c.includeInRop);
  if (ropCols.length === 0) return [];

  const rops: Record<string, number> = {};
  for (const row of ropRows) rops[row.columnKey] = row.ropQty;

  const warehousesByInstance = new Map<string, Set<string>>();
  for (const col of ropCols) {
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
      const bins = await fetchBinActualQty({
        cfg: inst.cfg,
        warehouses: whs,
        itemCodes: [trimmed],
      });
      for (const [key, qty] of bins) binMap.set(key, qty);
    }),
  );

  return ropCols.map((col) => {
    const stock =
      col.warehouses.length === 0 ? null : stockForColumn(binMap, col.warehouses, trimmed);
    const rop = rops[col.key] ?? null;
    return {
      key: col.key,
      label: col.label,
      stock,
      rop,
      reorderQty: orderQty(rop, stock),
    };
  });
}
