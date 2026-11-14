import "server-only";

import { buildShopStockRows } from "@/lib/shop-stock-status/calc";
import {
  SHOP_STOCK_TAB_COLUMNS,
  type ShopStockStatus,
  type ShopStockTab,
} from "@/lib/shop-stock-status/config";
import { buildCommonSkuRows } from "@/lib/stock-health/calc";
import { loadRopBySkuColumn } from "@/lib/stock-health/rop-status";
import { getLiveStockHealthData, loadExcludedSkus } from "@/lib/stock-health/weekly-summary";

/**
 * Same live ERP data (cache), Excluded SKUs and OSF ROP as Stock Health → ROP Status,
 * split per shop / Online.
 */
export async function loadShopStockStatus(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<ShopStockStatus> {
  const [live, excluded, ropBySkuColumn] = await Promise.all([
    getLiveStockHealthData(companyId, options),
    loadExcludedSkus(companyId),
    loadRopBySkuColumn(companyId),
  ]);
  const commonRows = buildCommonSkuRows(live.items, live.stockBySku, excluded);
  const rowsFor = (tab: ShopStockTab) =>
    buildShopStockRows(commonRows, live.stockByWarehouse, ropBySkuColumn, SHOP_STOCK_TAB_COLUMNS[tab]);
  return {
    tabs: { shops: rowsFor("shops"), online: rowsFor("online") },
    fetchedAt: live.fetchedAt.toISOString(),
  };
}
