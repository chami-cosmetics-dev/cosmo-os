import "server-only";

import { osfCompletedSalesOrderWhere } from "@/lib/osf/assist-sales";
import type { OsfResolvedColumn } from "@/lib/osf/column-config";
import { prisma } from "@/lib/prisma";

/** Cosmo completed sales lookback for location allocation weighting. */
export const STORE_ALLOCATION_SALES_LOOKBACK_DAYS = 90;

function colomboRangeLastDays(
  days: number,
  now = new Date(),
): { start: Date; endExclusive: Date } {
  const endExclusive = now;
  const start = new Date(now.getTime() - days * 86_400_000);
  return { start, endExclusive };
}

/**
 * Cosmo completed sales units for one SKU in the last 90 days (3 months),
 * keyed by OSF column key.
 * Attribution: Order.companyLocationId → OsfColumnConfig.companyLocationId.
 * Columns without a mapped location get 0.
 */
export async function salesByOsfColumnLast90d(
  companyId: string,
  sku: string,
  columns: OsfResolvedColumn[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const col of columns) result.set(col.key, 0);

  const skuTrim = sku.trim();
  if (!skuTrim || columns.length === 0) return result;

  const locationToColumns = new Map<string, string[]>();
  for (const col of columns) {
    if (!col.companyLocationId) continue;
    const list = locationToColumns.get(col.companyLocationId) ?? [];
    list.push(col.key);
    locationToColumns.set(col.companyLocationId, list);
  }
  if (locationToColumns.size === 0) return result;

  const { start, endExclusive } = colomboRangeLastDays(STORE_ALLOCATION_SALES_LOOKBACK_DAYS);
  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: {
        ...osfCompletedSalesOrderWhere(companyId, start, endExclusive),
        companyLocationId: { in: [...locationToColumns.keys()] },
      },
      productItem: { sku: skuTrim },
    },
    select: {
      quantity: true,
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
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at || at < start || at >= endExclusive) continue;
    const locId = line.order.companyLocationId;
    if (!locId) continue;
    const keys = locationToColumns.get(locId);
    if (!keys?.length) continue;
    const share = line.quantity;
    for (const key of keys) {
      result.set(key, (result.get(key) ?? 0) + share);
    }
  }

  return result;
}
