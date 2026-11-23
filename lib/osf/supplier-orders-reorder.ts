import "server-only";

import { Prisma } from "@prisma/client";

import { formatAppIsoDate } from "@/lib/format-datetime";
import { resolveOsfColumns, type OsfResolvedColumn } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { orderQty, sumSignedOrderQtysFlooredAtZero } from "@/lib/osf/formulas";
import { prisma } from "@/lib/prisma";

type StockSnapshot = {
  totalStock?: string;
  totalRop?: string;
  columns: { columnKey: string; erpInstanceId: string; warehouses: string[]; itemCode: string }[];
};

const Quantity = Prisma.Decimal.clone({ precision: 128 });

function snapshotForSku(
  sku: string,
  columns: OsfResolvedColumn[],
  stockByInstance: Map<string, Map<string, string>>,
  rops: Record<string, number>,
): StockSnapshot {
  let stock = new Quantity(0);
  let rop = new Quantity(0);
  let stockKnown = true;
  let ropKnown = true;
  const warehouseScopes = new Set<string>();
  const sources: StockSnapshot["columns"] = [];

  for (const col of columns) {
    if (rops[col.key] == null || rops[col.key] < 0) ropKnown = false;
    else rop = rop.plus(rops[col.key]);

    const instance = col.erpnextInstanceId;
    if (!instance || col.warehouses.length === 0) {
      stockKnown = false;
      continue;
    }
    sources.push({ columnKey: col.key, erpInstanceId: instance, warehouses: col.warehouses, itemCode: sku });
    for (const warehouse of col.warehouses) {
      const scope = JSON.stringify([instance, warehouse]);
      // Overlapping columns cannot produce a comparable numerator and denominator.
      if (warehouseScopes.has(scope)) {
        stockKnown = false;
        ropKnown = false;
        continue;
      }
      warehouseScopes.add(scope);
      const observed = stockByInstance.get(instance)?.get(JSON.stringify([warehouse, sku]));
      if (observed === undefined) stockKnown = false;
      else stock = stock.plus(observed);
    }
  }

  return {
    ...(stockKnown ? { totalStock: stock.toFixed() } : {}),
    ...(ropKnown ? { totalRop: rop.toFixed() } : {}),
    columns: sources,
  };
}

/**
 * Use the same company-scoped ROP and ERP Bin batch as the legacy order quantity.
 * Coverage totals are exported only for matching stock and ROP column scopes.
 */
export async function computeSupplierOrderSnapshot(companyId: string, skus: string[], includeCoverage = true) {
  const asOfDate = formatAppIsoDate(new Date());
  const uniqueSkus = [...new Set(skus.map((s) => s.trim()).filter(Boolean))];
  const totalOrderQty = new Map(uniqueSkus.map((sku) => [sku, 0]));
  const snapshots = new Map<string, StockSnapshot>();
  const result = { asOfDate, totalOrderQty, snapshots };
  if (uniqueSkus.length === 0) return result;

  const [columns, ropRows] = await Promise.all([
    resolveOsfColumns(companyId),
    prisma.productOsfRop.findMany({ where: { companyId, sku: { in: uniqueSkus } } }),
  ]);
  const stockCols = columns.filter((c) => c.active && c.includeInStock);
  const ropCols = columns.filter((c) => c.active && c.includeInRop);
  if (stockCols.length === 0 || ropCols.length === 0) return result;
  const ropKeys = new Set(ropCols.map(({ key }) => key));
  const comparable = includeCoverage && stockCols.length === ropCols.length && stockCols.every(({ key }) => ropKeys.has(key));
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
  const binsByInstance = new Map<string, Map<string, number>>();
  const emptyBins = new Map<string, number>();
  const stockByInstance = new Map<string, Map<string, string>>();
  await Promise.all(erpInstances.map(async (inst) => {
    const warehouses = [...(warehousesByInstance.get(inst.id) ?? [])];
    if (!warehouses.length) return;
    const observedBins = comparable ? new Map<string, string>() : undefined;
    const bins = await fetchBinActualQty({ cfg: inst.cfg, warehouses, itemCodes: uniqueSkus, observedBins });
    if (observedBins) stockByInstance.set(inst.id, observedBins);
    binsByInstance.set(inst.id, bins);
  }));

  for (const sku of uniqueSkus) {
    const rops = ropsBySku.get(sku) ?? {};
    const orderVals = stockCols.map((col) => orderQty(
      ropKeys.has(col.key) ? (rops[col.key] ?? null) : null,
      stockForColumn(binsByInstance.get(col.erpnextInstanceId ?? "") ?? emptyBins, col.warehouses, sku),
    ));
    totalOrderQty.set(sku, sumSignedOrderQtysFlooredAtZero(orderVals));
    if (comparable) snapshots.set(sku, snapshotForSku(sku, stockCols, stockByInstance, rops));
  }
  return result;
}

/** Preserve the legacy TOTAL ORDER QTY for existing consumers. */
export async function computeTotalOrderQtyForSkus(companyId: string, skus: string[]) {
  return (await computeSupplierOrderSnapshot(companyId, skus, false)).totalOrderQty;
}
