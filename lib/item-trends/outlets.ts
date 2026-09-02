import "server-only";

import { osfCompletedSalesOrderWhere } from "@/lib/osf/assist-sales";
import { resolveOsfColumns, type OsfResolvedColumn } from "@/lib/osf/column-config";
import { fetchBinActualQty, getAllOsfErpInstances, stockForColumn } from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";

import { calendarDaysInclusive } from "@/lib/item-trends/aggregate";
import type { ItemTrendDateRange } from "@/lib/item-trends/types";
import type { OutletBalanceRow, StockPressure, TransferCandidate } from "@/lib/item-trends/types";

function locationToColumns(columns: OsfResolvedColumn[]): Map<string, OsfResolvedColumn[]> {
  const map = new Map<string, OsfResolvedColumn[]>();
  for (const col of columns) {
    if (!col.companyLocationId || !col.includeInStock) continue;
    const list = map.get(col.companyLocationId) ?? [];
    list.push(col);
    map.set(col.companyLocationId, list);
  }
  return map;
}

export async function salesByOsfColumnInRange(
  companyId: string,
  range: ItemTrendDateRange,
  columns: OsfResolvedColumn[],
  skuFilter?: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  const locationToCols = locationToColumns(columns);
  if (locationToCols.size === 0) return result;

  const skuList = skuFilter?.map((s) => s.trim()).filter(Boolean);
  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: {
        ...osfCompletedSalesOrderWhere(companyId, range.rangeStart, range.rangeEndExclusive),
        companyLocationId: { in: [...locationToCols.keys()] },
      },
      ...(skuList?.length ? { productItem: { sku: { in: skuList } } } : {}),
    },
    select: {
      quantity: true,
      productItem: { select: { sku: true } },
      order: {
        select: {
          companyLocationId: true,
          deliveryCompleteAt: true,
          invoiceCompleteAt: true,
        },
      },
    },
  });

  for (const line of lines) {
    const sku = line.productItem.sku?.trim();
    if (!sku) continue;
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at || at < range.rangeStart || at >= range.rangeEndExclusive) continue;
    const locId = line.order.companyLocationId;
    if (!locId) continue;
    const cols = locationToCols.get(locId);
    if (!cols?.length) continue;

    let skuMap = result.get(sku);
    if (!skuMap) {
      skuMap = new Map();
      result.set(sku, skuMap);
    }
    for (const col of cols) {
      skuMap.set(col.key, (skuMap.get(col.key) ?? 0) + line.quantity);
    }
  }

  return result;
}

function stockPressure(stock: number | null, speed: number): StockPressure {
  if (stock == null) return "balanced";
  if (stock >= 10 && speed < 0.5) return "high_slow";
  if (stock <= 5 && speed >= 1) return "low_fast";
  return "balanced";
}

function quartile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((sorted.length - 1) * q);
  return sorted[idx] ?? 0;
}

export async function fetchOutletBalanceAndTransfers(input: {
  companyId: string;
  range: ItemTrendDateRange;
  columnKeys?: string[] | null;
  skuFilter?: string[];
  limit?: number;
}): Promise<{ outlets: OutletBalanceRow[]; transfers: TransferCandidate[] }> {
  const columns = (await resolveOsfColumns(input.companyId)).filter(
    (c) => c.active && c.includeInStock && c.companyLocationId,
  );
  const scoped =
    input.columnKeys?.length ?
      columns.filter((c) => input.columnKeys!.includes(c.key))
    : columns;

  if (scoped.length === 0) return { outlets: [], transfers: [] };

  const salesMap = await salesByOsfColumnInRange(
    input.companyId,
    input.range,
    scoped,
    input.skuFilter,
  );

  const skus =
    input.skuFilter?.length ?
      input.skuFilter.map((s) => s.trim()).filter(Boolean)
    : [...salesMap.keys()].slice(0, 50);

  const stockCols = scoped.filter((c) => c.includeInRop || c.includeInStock);
  const warehousesByInstance = new Map<string, Set<string>>();
  for (const col of stockCols) {
    if (!col.erpnextInstanceId) continue;
    const set = warehousesByInstance.get(col.erpnextInstanceId) ?? new Set<string>();
    for (const wh of col.warehouses) set.add(wh);
    warehousesByInstance.set(col.erpnextInstanceId, set);
  }

  const erpInstances = await getAllOsfErpInstances(input.companyId);
  const binMap = new Map<string, number>();
  if (skus.length > 0) {
    await Promise.all(
      erpInstances.map(async (inst) => {
        const whs = [...(warehousesByInstance.get(inst.id) ?? [])];
        if (!whs.length) return;
        const bins = await fetchBinActualQty({
          cfg: inst.cfg,
          warehouses: whs,
          itemCodes: skus,
        });
        for (const [key, qty] of bins) binMap.set(key, qty);
      }),
    );
  }

  const outlets: OutletBalanceRow[] = [];
  const transfers: TransferCandidate[] = [];
  const days = calendarDaysInclusive(input.range.fromYmd, input.range.toYmd);

  for (const sku of skus) {
    const colSales = salesMap.get(sku) ?? new Map<string, number>();
    const speeds: { col: OsfResolvedColumn; stock: number; speed: number; units: number }[] = [];

    for (const col of scoped) {
      const units = colSales.get(col.key) ?? 0;
      const speed = units / days;
      const stock =
        col.warehouses.length === 0 ? null : stockForColumn(binMap, col.warehouses, sku);
      outlets.push({
        sku,
        columnKey: col.key,
        outletName: col.label,
        stockQty: stock,
        unitsInRange: units,
        speedPerDay: Math.round(speed * 100) / 100,
        stockPressure: stockPressure(stock, speed),
      });
      if (stock != null) {
        speeds.push({ col, stock, speed, units });
      }
    }

    if (speeds.length < 2) continue;
    const speedValues = speeds.map((s) => s.speed);
    const bottomQ = quartile(speedValues, 0.25);
    const topQ = quartile(speedValues, 0.75);
    const medianStock = quartile(
      speeds.map((s) => s.stock),
      0.5,
    );

    const sources = speeds.filter(
      (s) => s.speed <= bottomQ && s.stock >= Math.max(medianStock, 5) && s.stock >= 5,
    );
    const dests = speeds.filter((s) => s.speed >= topQ && s.units >= 3);

    for (const src of sources) {
      for (const dest of dests) {
        if (src.col.key === dest.col.key) continue;
        if (dest.speed < src.speed * 2 && dest.speed < 1) continue;
        transfers.push({
          sku,
          sourceColumnKey: src.col.key,
          sourceOutletName: src.col.label,
          sourceStock: src.stock,
          sourceSpeed: Math.round(src.speed * 100) / 100,
          destColumnKey: dest.col.key,
          destOutletName: dest.col.label,
          destStock: dest.stock,
          destSpeed: Math.round(dest.speed * 100) / 100,
          message: `Move stock from ${src.col.label} to ${dest.col.label}`,
        });
        break;
      }
    }
  }

  const limit = input.limit ?? 100;
  return {
    outlets: outlets.slice(0, limit),
    transfers: transfers.slice(0, limit),
  };
}
