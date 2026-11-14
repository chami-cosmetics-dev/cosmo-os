import {
  SHOP_STOCK_COLUMNS,
  shopStockBandOf,
  type ShopStockCell,
  type ShopStockColumn,
  type ShopStockRow,
} from "@/lib/shop-stock-status/config";
import { isZeroStock, skuKey, type StockHealthCommonSkuRow } from "@/lib/stock-health/calc";
import type { StockHealthStatus } from "@/lib/stock-health/config";

/**
 * One row per Common SKU (the Stock Health rows: same grouping, exclusions and active
 * variants), sorted by Common SKU. Per column: stock of all variants in its warehouses /
 * ROP of all variants in its OSF columns (+ any ROP on the Common SKU itself, as in
 * ROP Status). `stockByWarehouse` is keyed by `skuKey` then `warehouseKey`.
 */
export function buildShopStockRows(
  commonRows: StockHealthCommonSkuRow[],
  stockByWarehouse: Map<string, Map<string, number>>,
  ropBySkuColumn: Map<string, Map<string, number>>,
  columns: ShopStockColumn[] = SHOP_STOCK_COLUMNS,
): ShopStockRow[] {
  const warehouseKeys = columns.map((c) => c.warehouses.map((w) => w.trim().toLowerCase()));

  return [...commonRows]
    .sort((a, b) => a.commonSku.localeCompare(b.commonSku))
    .map((row) => {
      const variants = [...row.variants].sort((a, b) => a.sku.localeCompare(b.sku));
      const variantKeys = new Set(variants.map((v) => skuKey(v.sku)));
      const ropKeys = variantKeys.has(row.commonSku) ? [...variantKeys] : [...variantKeys, row.commonSku];

      const cells: Record<string, ShopStockCell> = {};
      let fail = 0;
      let pass = 0;
      columns.forEach((column, i) => {
        let stock = 0;
        for (const key of variantKeys) {
          const byWarehouse = stockByWarehouse.get(key);
          if (!byWarehouse) continue;
          for (const wh of warehouseKeys[i]) stock += byWarehouse.get(wh) ?? 0;
        }
        let rop = 0;
        for (const key of ropKeys) {
          const byColumn = ropBySkuColumn.get(key);
          if (!byColumn) continue;
          for (const col of column.ropColumnKeys) rop += byColumn.get(col) ?? 0;
        }
        const percent = rop > 0 ? (stock / rop) * 100 : null;
        if (percent !== null) {
          if (shopStockBandOf(percent) === "fail") fail += 1;
          else pass += 1;
        }
        cells[column.key] = { stock, rop, percent };
      });

      return {
        commonSku: row.commonSku,
        itemName: variants.find((v) => v.itemName)?.itemName ?? null,
        priority: row.status,
        cells,
        fail,
        pass,
      };
    });
}

/** One location's summary (Stock Health mail 2, "Company Wise"). */
export type ShopStockLocationCounts = {
  /** ROP there, stock at least 50% of it (yellow + green cells). */
  pass: number;
  /** ROP there, stock below 50% of it (red cells). */
  fail: number;
  /** No ROP there, stock above 0 there. */
  noRopWithStock: number;
  /** No ROP and no stock there — only counted when asked (Top); otherwise left out entirely. */
  noRopNoStock: number;
  /** pass + fail + noRopWithStock (+ noRopNoStock when counted). */
  total: number;
  /** ROP there, stock ≤ 0 there — inside Fail, not added to the total. */
  zeroStock: number;
};

/**
 * Counts one column (location) over the Shop Stock Status rows. Items with no ROP and no stock
 * there are left out, unless `countNoRopNoStock` (then they count in `noRopNoStock` + `total`,
 * but not in `zeroStock`).
 */
export function summarizeShopStockLocation(
  rows: ShopStockRow[],
  columnKey: string,
  options: { countNoRopNoStock?: boolean } = {},
): ShopStockLocationCounts {
  const counts: ShopStockLocationCounts = { pass: 0, fail: 0, noRopWithStock: 0, noRopNoStock: 0, total: 0, zeroStock: 0 };
  for (const row of rows) {
    const cell = row.cells[columnKey];
    if (!cell) continue;
    if (cell.percent === null) {
      if (cell.stock > 0) counts.noRopWithStock += 1;
      else if (options.countNoRopNoStock) counts.noRopNoStock += 1;
      else continue;
    } else {
      if (shopStockBandOf(cell.percent) === "fail") counts.fail += 1;
      else counts.pass += 1;
      if (isZeroStock(cell.stock)) counts.zeroStock += 1;
    }
    counts.total += 1;
  }
  return counts;
}

/** Priorities whose no ROP + no stock items are counted (mail 2's Company Wise table). */
export const COUNT_NO_ROP_NO_STOCK_FOR: readonly StockHealthStatus[] = ["Top"];

/**
 * One location's counts per priority (Top, Low, …): the same rules, split by Common SKU
 * priority; for Top, items with no ROP and no stock are counted too.
 */
export function summarizeShopStockLocationByPriority(
  rows: ShopStockRow[],
  columnKey: string,
): Partial<Record<StockHealthStatus, ShopStockLocationCounts>> {
  const byPriority: Partial<Record<StockHealthStatus, ShopStockRow[]>> = {};
  for (const row of rows) (byPriority[row.priority] ??= []).push(row);
  return Object.fromEntries(
    Object.entries(byPriority).map(([priority, list]) => [
      priority,
      summarizeShopStockLocation(list!, columnKey, {
        countNoRopNoStock: COUNT_NO_ROP_NO_STOCK_FOR.includes(priority as StockHealthStatus),
      }),
    ]),
  );
}

/** One Shop Stock Status dashboard card (a shop or an online company). */
export type ShopStockDashboardCard = {
  /** ROP of every Common SKU with a ROP at the location. */
  totalRop: number;
  /** Stock of those same Common SKUs (items with no ROP there are left out). */
  totalStock: number;
  /** totalStock / totalRop × 100; null when the location has no ROP. */
  fulfilment: number | null;
  /** Common SKU counts by the tables' colours: red < 50%, yellow 50–100%, green > 100%. */
  red: number;
  yellow: number;
  green: number;
  /** No ROP there, stock above 0 there. No ROP + no stock is ignored. */
  purple: number;
};

/** Sums one column (location) of the Shop Stock Status rows for its dashboard card. */
export function summarizeShopStockDashboardCard(rows: ShopStockRow[], columnKey: string): ShopStockDashboardCard {
  const card: ShopStockDashboardCard = {
    totalRop: 0,
    totalStock: 0,
    fulfilment: null,
    red: 0,
    yellow: 0,
    green: 0,
    purple: 0,
  };
  for (const row of rows) {
    const cell = row.cells[columnKey];
    if (!cell) continue;
    if (cell.percent === null) {
      if (cell.stock > 0) card.purple += 1;
      continue;
    }
    card.totalRop += cell.rop;
    card.totalStock += cell.stock;
    const band = shopStockBandOf(cell.percent);
    if (band === "fail") card.red += 1;
    else if (band === "pass") card.yellow += 1;
    else card.green += 1;
  }
  card.fulfilment = card.totalRop > 0 ? (card.totalStock / card.totalRop) * 100 : null;
  return card;
}
