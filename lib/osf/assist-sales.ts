import "server-only";

import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Shared OSF completed-sale order filter for a half-open [start, end) window. */
export function osfCompletedSalesOrderWhere(
  companyId: string,
  start: Date,
  endExclusive: Date,
): PrismaTypes.OrderWhereInput {
  return {
    companyId,
    cancelledAt: null,
    fulfillmentStage: { in: ["delivery_complete", "invoice_complete"] },
    OR: [
      { deliveryCompleteAt: { gte: start, lt: endExclusive } },
      {
        AND: [
          { deliveryCompleteAt: null },
          { invoiceCompleteAt: { gte: start, lt: endExclusive } },
        ],
      },
    ],
  };
}

/**
 * Aggregate sold units by SKU for [start, endExclusive).
 * Same completion rules as monthly OSF sales (no return netting).
 * Optional skuFilter limits to a page of SKUs.
 */
export async function aggregateSalesBySkuInRange(
  companyId: string,
  start: Date,
  endExclusive: Date,
  skuFilter?: string[],
): Promise<Map<string, number>> {
  const byMonth = await aggregateSalesBySkuByMonthInRange(
    companyId,
    start,
    endExclusive,
    skuFilter,
  );
  const map = new Map<string, number>();
  for (const [sku, months] of byMonth) {
    let total = 0;
    for (const qty of months.values()) total += qty;
    map.set(sku, total);
  }
  return map;
}

/**
 * Units by SKU then Colombo calendar month (YYYY-MM) for [start, endExclusive).
 */
type SalesMonthRow = { sku: string; month: string; qty: number };

/**
 * Group completed units in Postgres. Loading every line for the April–today
 * window exhausted the generate function's memory.
 */
async function querySalesBySkuMonth(
  companyId: string,
  start: Date,
  endExclusive: Date,
  skuFilter?: string[],
): Promise<SalesMonthRow[]> {
  const skuList = skuFilter?.map((s) => s.trim()).filter(Boolean);
  const skuClause =
    skuList && skuList.length > 0
      ? Prisma.sql`AND btrim(pi.sku) IN (${Prisma.join(skuList)})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ sku: string; month: string; qty: bigint | number }>>(
    Prisma.sql`
      SELECT btrim(pi.sku) AS sku,
             to_char(
               timezone(
                 'Asia/Colombo',
                 COALESCE(o."deliveryCompleteAt", o."invoiceCompleteAt")
               ),
               'YYYY-MM'
             ) AS month,
             SUM(li.quantity)::int AS qty
      FROM "OrderLineItem" li
      JOIN "Order" o ON o.id = li."orderId"
      JOIN "ProductItem" pi ON pi.id = li."productItemId"
      WHERE o."companyId" = ${companyId}
        AND o."cancelledAt" IS NULL
        AND o."fulfillmentStage"::text IN ('delivery_complete', 'invoice_complete')
        AND (
          (o."deliveryCompleteAt" >= ${start} AND o."deliveryCompleteAt" < ${endExclusive})
          OR (
            o."deliveryCompleteAt" IS NULL
            AND o."invoiceCompleteAt" >= ${start}
            AND o."invoiceCompleteAt" < ${endExclusive}
          )
        )
        AND pi.sku IS NOT NULL
        AND btrim(pi.sku) <> ''
        ${skuClause}
      GROUP BY 1, 2
    `,
  );

  return rows.map((row) => ({
    sku: row.sku,
    month: row.month,
    qty: Number(row.qty),
  }));
}

export async function aggregateSalesBySkuByMonthInRange(
  companyId: string,
  start: Date,
  endExclusive: Date,
  skuFilter?: string[],
): Promise<Map<string, Map<string, number>>> {
  const rows = await querySalesBySkuMonth(companyId, start, endExclusive, skuFilter);
  const bySku = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.sku || !row.month || !Number.isFinite(row.qty)) continue;
    let months = bySku.get(row.sku);
    if (!months) {
      months = new Map();
      bySku.set(row.sku, months);
    }
    months.set(row.month, (months.get(row.month) ?? 0) + row.qty);
  }
  return bySku;
}
