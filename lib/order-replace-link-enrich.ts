import "server-only";

import { formatBusinessOrderNumber } from "@/lib/order-display-label";
import { prisma } from "@/lib/prisma";
import type { OrderReplaceLinkSummary } from "@/lib/order-replace-link";

type LinkFields = {
  id: string;
  replacedByOrderId: string | null;
};

export async function enrichOrdersWithReplaceLinks<T extends LinkFields>(
  companyId: string,
  orders: T[]
): Promise<
  Array<
    T & {
      replacedByOrder: OrderReplaceLinkSummary | null;
      replacedFromOrders: OrderReplaceLinkSummary[];
    }
  >
> {
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const targetIds = [
    ...new Set(orders.map((o) => o.replacedByOrderId).filter((id): id is string => Boolean(id))),
  ];

  const [targets, predecessors] = await Promise.all([
    targetIds.length > 0
      ? prisma.order.findMany({
          where: { companyId, id: { in: targetIds } },
          select: {
            id: true,
            name: true,
            orderNumber: true,
            erpnextInvoiceId: true,
            shopifyOrderId: true,
            cancelledAt: true,
          },
        })
      : Promise.resolve([]),
    prisma.order.findMany({
      where: { companyId, replacedByOrderId: { in: orderIds } },
      select: {
        id: true,
        name: true,
        orderNumber: true,
        erpnextInvoiceId: true,
        shopifyOrderId: true,
        cancelledAt: true,
        replacedByOrderId: true,
      },
    }),
  ]);

  const targetById = new Map(
    targets.map((row) => [
      row.id,
      {
        id: row.id,
        orderLabel: formatBusinessOrderNumber(row),
        name: row.name,
        orderNumber: row.orderNumber,
        erpnextInvoiceId: row.erpnextInvoiceId,
        cancelledAt: row.cancelledAt?.toISOString() ?? null,
      } satisfies OrderReplaceLinkSummary,
    ])
  );

  const predecessorsByTarget = new Map<string, OrderReplaceLinkSummary[]>();
  for (const row of predecessors) {
    if (!row.replacedByOrderId) continue;
    const list = predecessorsByTarget.get(row.replacedByOrderId) ?? [];
    list.push({
      id: row.id,
      orderLabel: formatBusinessOrderNumber(row),
      name: row.name,
      orderNumber: row.orderNumber,
      erpnextInvoiceId: row.erpnextInvoiceId,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
    });
    predecessorsByTarget.set(row.replacedByOrderId, list);
  }

  return orders.map((order) => ({
    ...order,
    replacedByOrder: order.replacedByOrderId
      ? targetById.get(order.replacedByOrderId) ?? null
      : null,
    replacedFromOrders: predecessorsByTarget.get(order.id) ?? [],
  }));
}
