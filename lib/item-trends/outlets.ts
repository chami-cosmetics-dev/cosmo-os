import "server-only";

import { isPosChannelOrder } from "@/lib/merchant-dashboard/channel-sales";
import { osfCompletedSalesOrderWhere } from "@/lib/osf/assist-sales";
import { resolveOsfColumns, type OsfResolvedColumn } from "@/lib/osf/column-config";
import {
  fetchBinActualQty,
  fetchPositiveBinsByWarehouses,
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

  const skuList = skuFilter?.map((s) => s.trim()).filter(Boolean);
  const orderScopeParts: object[] = [];
  if (shopWarehouseNames.length > 0) {
    orderScopeParts.push({ erpnextWarehouse: { in: shopWarehouseNames } });
  }
  if (locationIds.length > 0) {
    // Trading POS at shop locations (warehouse may be blank on older rows)
    orderScopeParts.push({
      AND: [
        { companyLocationId: { in: locationIds } },
        { sourceName: { in: ["pos", "erpnext-pos"] } },
      ],
    });
  }
  const orderScope =
    orderScopeParts.length === 1 ? orderScopeParts[0]! : { OR: orderScopeParts };

  const skuWhere =
    skuList?.length === 1
      ? { productItem: { sku: { equals: skuList[0]!, mode: "insensitive" as const } } }
      : skuList?.length
        ? { productItem: { sku: { in: skuList } } }
        : {};

  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: {
        ...osfCompletedSalesOrderWhere(companyId, range.rangeStart, range.rangeEndExclusive),
        ...orderScope,
      },
      ...skuWhere,
    },
    select: {
      quantity: true,
      productItem: { select: { sku: true } },
      order: {
        select: {
          companyLocationId: true,
          erpnextWarehouse: true,
          sourceName: true,
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
    const cols = columnsForOutletOrder({
      companyLocationId: line.order.companyLocationId,
      erpnextWarehouse: line.order.erpnextWarehouse,
      sourceName: line.order.sourceName,
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

export async function fetchOutletBalanceAndTransfers(input: {
  companyId: string;
  range: ItemTrendDateRange;
  columnKeys?: string[] | null;
  skuFilter?: string[];
  priority?: string | null;
  limit?: number;
}): Promise<{ outlets: OutletBalanceRow[]; transfers: TransferCandidate[] }> {
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

  if (scoped.length === 0) return { outlets: [], transfers: [] };

  const salesMap = await salesByOsfColumnInRange(
    input.companyId,
    input.range,
    scoped,
    input.skuFilter,
  );

  const warehousesByInstance = new Map<string, Set<string>>();
  for (const col of scoped) {
    if (!col.erpnextInstanceId) continue;
    const set = warehousesByInstance.get(col.erpnextInstanceId) ?? new Set<string>();
    for (const wh of col.warehouses) set.add(wh);
    warehousesByInstance.set(col.erpnextInstanceId, set);
  }

  const erpInstances = await getAllOsfErpInstances(input.companyId);
  const binMap = new Map<string, number>();
  const skuFilter = input.skuFilter?.map((s) => s.trim()).filter(Boolean);

  await Promise.all(
    erpInstances.map(async (inst) => {
      const whs = [...(warehousesByInstance.get(inst.id) ?? [])];
      if (!whs.length) return;
      const bins =
        skuFilter?.length ?
          await fetchBinActualQty({ cfg: inst.cfg, warehouses: whs, itemCodes: skuFilter })
        : await fetchPositiveBinsByWarehouses({ cfg: inst.cfg, warehouses: whs });
      for (const [key, qty] of bins) binMap.set(key, qty);
    }),
  );

  const stockSkus = new Set<string>();
  for (const key of binMap.keys()) {
    const sku = key.split("::")[1]?.trim();
    if (sku) stockSkus.add(sku);
  }

  const soldSkus =
    skuFilter?.length ?
      (() => {
        const wanted = new Set(skuFilter.map((s) => s.toLowerCase()));
        const fromSales = [...salesMap.keys()].filter((s) => wanted.has(s.toLowerCase()));
        return fromSales.length > 0 ? fromSales : skuFilter;
      })()
    : [...salesMap.keys()];
  const rawSkus = [...new Set([...soldSkus, ...stockSkus])];
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
        col.warehouses.length === 0 ? null : stockForColumn(binMap, col.warehouses, sku);
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

    if (speeds.length < 2) continue;

    // Shop-to-shop: sitting stock + slow counter vs faster counter elsewhere.
    // Avoid quartile-only pairing — with few shops / short windows it rarely fires.
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

  return { outlets, transfers };
}
