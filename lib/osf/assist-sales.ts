import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Shared OSF completed-sale order filter for a half-open [start, end) window. */
export function osfCompletedSalesOrderWhere(
  companyId: string,
  start: Date,
  endExclusive: Date,
): Prisma.OrderWhereInput {
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
  const skuList = skuFilter?.map((s) => s.trim()).filter(Boolean);
  const lines = await prisma.orderLineItem.findMany({
    where: {
      order: osfCompletedSalesOrderWhere(companyId, start, endExclusive),
      ...(skuList?.length
        ? { productItem: { sku: { in: skuList } } }
        : {}),
    },
    select: {
      quantity: true,
      productItem: { select: { sku: true } },
      order: {
        select: {
          deliveryCompleteAt: true,
          invoiceCompleteAt: true,
        },
      },
    },
  });

  const map = new Map<string, number>();
  for (const line of lines) {
    const sku = line.productItem.sku?.trim();
    if (!sku) continue;
    const at = line.order.deliveryCompleteAt ?? line.order.invoiceCompleteAt;
    if (!at) continue;
    if (at < start || at >= endExclusive) continue;
    map.set(sku, (map.get(sku) ?? 0) + line.quantity);
  }
  return map;
}
