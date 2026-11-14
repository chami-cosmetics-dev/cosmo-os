import "server-only";

import { APP_TIME_ZONE } from "@/lib/format-datetime";
import { resolveOsfColumns } from "@/lib/osf/column-config";
import { prisma } from "@/lib/prisma";
import {
  buildCommonSkuRows,
  buildOutOfStockRows,
  buildRopRows,
  skuKey,
  summarizeRopStatus,
  type ExcludedSkus,
  type StockHealthRopRow,
} from "@/lib/stock-health/calc";
import type { StockHealthOutOfStock, StockHealthRopStatus } from "@/lib/stock-health/config";
import {
  getLiveStockHealthData,
  loadExcludedSkus,
  type LiveStockHealthData,
} from "@/lib/stock-health/weekly-summary";

/** OSF ROP rows of every active OSF column with "Include in ROP". */
async function loadOsfRops(companyId: string) {
  const columns = await resolveOsfColumns(companyId);
  const ropColumnKeys = columns.filter((c) => c.active && c.includeInRop).map((c) => c.key);
  if (ropColumnKeys.length === 0) return [];

  return prisma.productOsfRop.findMany({
    where: { companyId, columnKey: { in: ropColumnKeys }, ropQty: { gt: 0 } },
    select: { sku: true, columnKey: true, ropQty: true },
  });
}

/**
 * OSF ROP per SKU, added up over every active OSF column with "Include in ROP"
 * (same total ROP as the OSF). Keyed by `skuKey`.
 */
async function loadRopBySku(companyId: string): Promise<Map<string, number>> {
  const ropBySku = new Map<string, number>();
  for (const rop of await loadOsfRops(companyId)) {
    const key = skuKey(rop.sku);
    ropBySku.set(key, (ropBySku.get(key) ?? 0) + rop.ropQty);
  }
  return ropBySku;
}

/** The same OSF ROP per SKU, kept per OSF column: `skuKey` → column key → ROP. */
export async function loadRopBySkuColumn(companyId: string): Promise<Map<string, Map<string, number>>> {
  const bySku = new Map<string, Map<string, number>>();
  for (const rop of await loadOsfRops(companyId)) {
    const key = skuKey(rop.sku);
    const byColumn = bySku.get(key) ?? new Map<string, number>();
    byColumn.set(rop.columnKey, (byColumn.get(rop.columnKey) ?? 0) + rop.ropQty);
    bySku.set(key, byColumn);
  }
  return bySku;
}

export type StockHealthRopData = LiveStockHealthData & {
  excluded: ExcludedSkus;
  ropBySku: Map<string, number>;
  /** One row per counted Common SKU, with its total ROP and group. */
  ropRows: StockHealthRopRow[];
};

/** Live ERP data (same cache + excluded SKUs as Weekly Summary) with OSF ROP. */
export async function loadStockHealthRopData(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<StockHealthRopData> {
  const [live, excluded, ropBySku] = await Promise.all([
    getLiveStockHealthData(companyId, options),
    loadExcludedSkus(companyId),
    loadRopBySku(companyId),
  ]);
  const ropRows = buildRopRows(buildCommonSkuRows(live.items, live.stockBySku, excluded), ropBySku);
  return { ...live, excluded, ropBySku, ropRows };
}

export function currentMonthName(): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: APP_TIME_ZONE }).format(new Date());
}

export async function loadStockHealthRopStatus(
  companyId: string,
  options: { refresh?: boolean } = {},
): Promise<StockHealthRopStatus> {
  const { ropRows, fetchedAt } = await loadStockHealthRopData(companyId, options);
  const { rows, grandTotal } = summarizeRopStatus(ropRows);
  return { month: currentMonthName(), rows, grandTotal, fetchedAt: fetchedAt.toISOString() };
}

/** The Common SKUs behind ROP Status's 0' Stock numbers (same data, same rows). */
export async function loadStockHealthOutOfStock(companyId: string): Promise<StockHealthOutOfStock> {
  const { ropRows, fetchedAt } = await loadStockHealthRopData(companyId);
  return { rows: buildOutOfStockRows(ropRows), fetchedAt: fetchedAt.toISOString() };
}
