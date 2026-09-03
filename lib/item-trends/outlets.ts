import "server-only";

import { Prisma } from "@prisma/client";

import { isPosChannelOrder } from "@/lib/merchant-dashboard/channel-sales";
import { resolveOsfColumns, type OsfResolvedColumn } from "@/lib/osf/column-config";
import {
  fetchBinActualQty,
  getAllOsfErpInstances,
  stockForColumn,
} from "@/lib/osf/erp-stock";
import { prisma } from "@/lib/prisma";

import { calendarDaysInclusive, filterSkusByPriority } from "@/lib/item-trends/aggregate";
import {
  isCosmeticsLkInternalShopColumn,
  isPhysicalShopOsfColumn,
  loadPhysicalShops,
  shopWarehousesForColumn,
} from "@/lib/item-trends/physical-shops";
import type { ItemTrendDateRange } from "@/lib/item-trends/types";
import type { OutletBalanceRow, StockPressure, TransferCandidate } from "@/lib/item-trends/types";

/** Cap ERP bin fan-out on list view (sold SKUs only). SKU lookup ignores cap. */
const MAX_STOCK_SKUS = 400;

function normalizeWarehouse(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Restrict OSF column warehouses to shop floors only (drop Main / Stores). */
export function withShopWarehousesOnly(col: OsfResolvedColumn): OsfResolvedColumn | null {
  const shops = shopWarehousesForColumn(col);
  if (shops.length === 0) return null;
  return { ...col, warehouses: shops, directWarehouses: shops };
}

function locationToColumns(columns: OsfResolvedColumn[]): Map<string, OsfResolvedColumn[]> {
  const map = new Map<string, OsfResolvedColumn[]>();
  for (const col of columns) {
    if (!col.companyLocationId || !col.includeInStock) continue;
    if (isCosmeticsLkInternalShopColumn(col)) continue;
    const list = map.get(col.companyLocationId) ?? [];
    list.push(col);
    map.set(col.companyLocationId, list);
  }
  return map;
}

function warehouseToColumns(columns: OsfResolvedColumn[]): Map<string, OsfResolvedColumn[]> {
  const map = new Map<string, OsfResolvedColumn[]>();
  for (const col of columns) {
    if (!col.includeInStock) continue;
    for (const wh of col.warehouses) {
      const key = normalizeWarehouse(wh);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(col);
      map.set(key, list);
    }
  }
  return map;
}

function columnsForWarehouse(
  warehouse: string | null | undefined,
  warehouseToCols: Map<string, OsfResolvedColumn[]>,
): OsfResolvedColumn[] {
  const key = normalizeWarehouse(warehouse);
  if (!key) return [];
  const exact = warehouseToCols.get(key);
  if (exact?.length) return exact;
  for (const [mapped, cols] of warehouseToCols) {
    if (key.includes(mapped) || mapped.includes(key)) return cols;
  }
  return [];
}

export function columnsForOutletOrder(input: {
  companyLocationId: string | null | undefined;
  erpnextWarehouse: string | null | undefined;
  sourceName?: string | null | undefined;
  locationToCols: Map<string, OsfResolvedColumn[]>;
  warehouseToCols: Map<string, OsfResolvedColumn[]>;
}): OsfResolvedColumn[] {
  const byWarehouse = columnsForWarehouse(input.erpnextWarehouse, input.warehouseToCols);
  if (byWarehouse.length) {
    const shops = byWarehouse.filter((col) => isCosmeticsLkInternalShopColumn(col));
    if (shops.length) return shops;
    return byWarehouse;
  }

  // No warehouse match: trading counter sales only (POS). Never Cosmetics.lk website.
  if (!isPosChannelOrder(input.sourceName)) return [];
  const locId = input.companyLocationId?.trim();
  if (!locId) return [];
  return input.locationToCols.get(locId) ?? [];
}

type SalesAggRow = {
  sku: string;
  warehouse: string | null;
  locationId: string | null;
  sourceName: string | null;
  units: number;
};

/**
 * Aggregate shop POS units by SKU + order attributes (one SQL round-trip).
 * Avoids Prisma hydrating every OrderLineItem + nested Order.
 */
export async function salesByOsfColumnInRange(
  companyId: string,
  range: ItemTrendDateRange,
  columns: OsfResolvedColumn[],
  skuFilter?: string[],
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  const locationToCols = locationToColumns(columns);
  const warehouseToCols = warehouseToColumns(columns);
  const locationIds = [...locationToCols.keys()];
  const shopWarehouseNames = [
    ...new Set(columns.flatMap((c) => c.warehouses).map((w) => w.trim()).filter(Boolean)),
  ];
  if (locationIds.length === 0 && shopWarehouseNames.length === 0) return result;

  const skuList = skuFilter?.map((s) => s.trim()).filter(Boolean) ?? [];
  const hasWh = shopWarehouseNames.length > 0;
  const hasLoc = locationIds.length > 0;

  const scopeSql =
    hasWh && hasLoc
      ? Prisma.sql`(
          o."erpnextWarehouse" IN (${Prisma.join(shopWarehouseNames)})
          OR (
            o."companyLocationId" IN (${Prisma.join(locationIds)})
            AND o."sourceName" IN ('pos', 'erpnext-pos')
          )
        )`
      : hasWh
        ? Prisma.sql`o."erpnextWarehouse" IN (${Prisma.join(shopWarehouseNames)})`
        : Prisma.sql`(
            o."companyLocationId" IN (${Prisma.join(locationIds)})
            AND o."sourceName" IN ('pos', 'erpnext-pos')
          )`;

  const skuSql =
    skuList.length === 1
      ? Prisma.sql`AND LOWER(TRIM(pi.sku)) = LOWER(${skuList[0]!})`
      : skuList.length > 1
        ? Prisma.sql`AND TRIM(pi.sku) IN (${Prisma.join(skuList)})`
        : Prisma.empty;

  const rows = await prisma.$queryRaw<SalesAggRow[]>`
    SELECT
      TRIM(pi.sku) AS sku,
      o."erpnextWarehouse" AS warehouse,
      o."companyLocationId" AS "locationId",
      o."sourceName" AS "sourceName",
      SUM(oli.quantity)::float AS units
    FROM "OrderLineItem" oli
    INNER JOIN "Order" o ON o.id = oli."orderId"
    INNER JOIN "ProductItem" pi ON pi.id = oli."productItemId"
    WHERE o."companyId" = ${companyId}
      AND o."cancelledAt" IS NULL
      AND o."fulfillmentStage" IN ('delivery_complete', 'invoice_complete')
      AND (
        (o."deliveryCompleteAt" >= ${range.rangeStart} AND o."deliveryCompleteAt" < ${range.rangeEndExclusive})
        OR (
          o."deliveryCompleteAt" IS NULL
          AND o."invoiceCompleteAt" >= ${range.rangeStart}
          AND o."invoiceCompleteAt" < ${range.rangeEndExclusive}
        )
      )
      AND pi.sku IS NOT NULL
      AND TRIM(pi.sku) <> ''
      AND ${scopeSql}
      ${skuSql}
    GROUP BY TRIM(pi.sku), o."erpnextWarehouse", o."companyLocationId", o."sourceName"
  `;

  for (const row of rows) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    const units = Number(row.units);
    if (!Number.isFinite(units) || units <= 0) continue;
    const cols = columnsForOutletOrder({
      companyLocationId: row.locationId,
      erpnextWarehouse: row.warehouse,
      sourceName: row.sourceName,
      locationToCols,
      warehouseToCols,
    });
    if (!cols.length) continue;

    let skuMap = result.get(sku);
    if (!skuMap) {
      skuMap = new Map();
      result.set(sku, skuMap);
    }
    for (const col of cols) {
      skuMap.set(col.key, (skuMap.get(col.key) ?? 0) + units);
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

function topSoldSkus(salesMap: Map<string, Map<string, number>>, limit: number): string[] {
  const totals = [...salesMap.entries()].map(([sku, cols]) => {
    let units = 0;
    for (const u of cols.values()) units += u;
    return { sku, units };
  });
  totals.sort((a, b) => b.units - a.units || a.sku.localeCompare(b.sku));
  return totals.slice(0, limit).map((t) => t.sku);
}

export async function fetchOutletBalanceAndTransfers(input: {
  companyId: string;
  range: ItemTrendDateRange;
  columnKeys?: string[] | null;
  skuFilter?: string[];
  priority?: string | null;
  /** When false, skip ERP bins (fast sales list). Default: true if SKU filter, else false. */
  includeStock?: boolean;
}): Promise<{ outlets: OutletBalanceRow[]; transfers: TransferCandidate[]; stockLoaded: boolean }> {
  const skuFilter = input.skuFilter?.map((s) => s.trim()).filter(Boolean);
  const includeStock = input.includeStock ?? Boolean(skuFilter?.length);

  const [allColumns, physicalShops] = await Promise.all([
    resolveOsfColumns(input.companyId),
    loadPhysicalShops(input.companyId),
  ]);

  const columns = allColumns
    .filter((c) => c.active && c.includeInStock && isPhysicalShopOsfColumn(c, physicalShops))
    .map((c) => withShopWarehousesOnly(c))
    .filter((c): c is OsfResolvedColumn => c != null);

  const scoped =
    input.columnKeys?.length ?
      columns.filter((c) => input.columnKeys!.includes(c.key))
    : columns;

  if (scoped.length === 0) {
    return { outlets: [], transfers: [], stockLoaded: includeStock };
  }

  const salesMap = await salesByOsfColumnInRange(
    input.companyId,
    input.range,
    scoped,
    skuFilter,
  );

  const soldSkus =
    skuFilter?.length ?
      (() => {
        const wanted = new Set(skuFilter.map((s) => s.toLowerCase()));
        const fromSales = [...salesMap.keys()].filter((s) => wanted.has(s.toLowerCase()));
        return fromSales.length > 0 ? fromSales : skuFilter;
      })()
    : [...salesMap.keys()];

  const binMap = new Map<string, number>();
  let stockLoaded = false;

  if (includeStock) {
    const itemCodes =
      skuFilter?.length ? soldSkus : topSoldSkus(salesMap, MAX_STOCK_SKUS);

    if (itemCodes.length > 0) {
      const warehousesByInstance = new Map<string, Set<string>>();
      for (const col of scoped) {
        if (!col.erpnextInstanceId) continue;
        const set = warehousesByInstance.get(col.erpnextInstanceId) ?? new Set<string>();
        for (const wh of col.warehouses) set.add(wh);
        warehousesByInstance.set(col.erpnextInstanceId, set);
      }

      const erpInstances = await getAllOsfErpInstances(input.companyId);
      await Promise.all(
        erpInstances.map(async (inst) => {
          const whs = [...(warehousesByInstance.get(inst.id) ?? [])];
          if (!whs.length) return;
          const bins = await fetchBinActualQty({
            cfg: inst.cfg,
            warehouses: whs,
            itemCodes,
          });
          for (const [key, qty] of bins) binMap.set(key, qty);
        }),
      );
      stockLoaded = true;
    } else {
      stockLoaded = true;
    }
  }

  const stockSkus = new Set<string>();
  for (const key of binMap.keys()) {
    const sku = key.split("::")[1]?.trim();
    if (sku) stockSkus.add(sku);
  }

  const rawSkus = [...new Set([...soldSkus, ...(skuFilter?.length ? stockSkus : [])])];
  // Explicit SKU lookup ignores priority — show that item at every shop.
  const skus =
    skuFilter?.length ?
      rawSkus
    : await filterSkusByPriority(input.companyId, rawSkus, input.priority);
  const includeEmptyShops = Boolean(skuFilter?.length);

  const outlets: OutletBalanceRow[] = [];
  const transfers: TransferCandidate[] = [];
  const days = calendarDaysInclusive(input.range.fromYmd, input.range.toYmd);
  const destMinUnits = days <= 7 ? 1 : 3;

  for (const sku of skus) {
    const colSales = salesMap.get(sku) ?? new Map<string, number>();
    const speeds: { col: OsfResolvedColumn; stock: number; speed: number; units: number }[] = [];

    for (const col of scoped) {
      const units = colSales.get(col.key) ?? 0;
      const speed = units / days;
      const stock =
        !stockLoaded || col.warehouses.length === 0
          ? null
          : stockForColumn(binMap, col.warehouses, sku);
      if (!includeEmptyShops && units <= 0 && (stock == null || stock <= 0)) continue;
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

    if (!stockLoaded || speeds.length < 2) continue;

    const sources = speeds.filter((s) => s.stock >= 5 && s.speed < 0.5);
    const dests = speeds
      .filter((s) => s.units >= destMinUnits && s.speed >= 0.5)
      .sort((a, b) => b.speed - a.speed || b.units - a.units);

    for (const src of sources) {
      const dest = dests.find(
        (d) =>
          d.col.key !== src.col.key &&
          d.speed >= Math.max(src.speed * 2, 0.5) &&
          d.units > src.units,
      );
      if (!dest) continue;
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
    }
  }

  return { outlets, transfers, stockLoaded };
}
