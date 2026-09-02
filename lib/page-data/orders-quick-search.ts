import "server-only";

import { Prisma } from "@prisma/client";

import { findOrderIdsByKokoReferenceSearch } from "@/lib/approval-koko-list";
import { formatBusinessOrderNumber } from "@/lib/order-display-label";
import { enrichOrdersWithReplaceLinks } from "@/lib/order-replace-link-enrich";
import { prisma } from "@/lib/prisma";

function extractCustomerName(shippingAddress: unknown, billingAddress: unknown) {
  const candidate = [shippingAddress, billingAddress].find(
    (value) => value && typeof value === "object"
  ) as
    | {
        first_name?: string | null;
        last_name?: string | null;
        name?: string | null;
      }
    | undefined;

  if (!candidate) return null;
  const full = candidate.name?.trim();
  if (full) return full;
  const joined = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ").trim();
  return joined || null;
}

export async function quickSearchOrders(params: {
  companyId: string;
  q: string;
  limit?: number;
}) {
  const searchTerm = params.q.trim();
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const nameMatches = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "Order"
    WHERE "companyId" = ${params.companyId}
      AND (
        COALESCE("shippingAddress"->>'name', '') ILIKE ${pattern}
        OR COALESCE("billingAddress"->>'name', '') ILIKE ${pattern}
        OR trim(
          concat_ws(
            ' ',
            COALESCE("shippingAddress"->>'first_name', ''),
            COALESCE("shippingAddress"->>'last_name', '')
          )
        ) ILIKE ${pattern}
        OR trim(
          concat_ws(
            ' ',
            COALESCE("billingAddress"->>'first_name', ''),
            COALESCE("billingAddress"->>'last_name', '')
          )
        ) ILIKE ${pattern}
      )
    LIMIT ${limit}
  `);

  const pattern = `%${searchTerm}%`;
  const kokoRefOrderIds = await findOrderIdsByKokoReferenceSearch(params.companyId, searchTerm);

  const orders = await prisma.order.findMany({
    where: {
      companyId: params.companyId,
      OR: [
        { orderNumber: { contains: searchTerm, mode: "insensitive" } },
        { name: { contains: searchTerm, mode: "insensitive" } },
        { customerPhone: { contains: searchTerm, mode: "insensitive" } },
        { customerEmail: { contains: searchTerm, mode: "insensitive" } },
        ...(nameMatches.length > 0 ? [{ id: { in: nameMatches.map((row) => row.id) } }] : []),
        ...(kokoRefOrderIds.length > 0 ? [{ id: { in: kokoRefOrderIds } }] : []),
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      name: true,
      shopifyOrderId: true,
      customerPhone: true,
      shippingAddress: true,
      billingAddress: true,
      fulfillmentStage: true,
      totalPrice: true,
      currency: true,
      replacedByOrderId: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const enriched = await enrichOrdersWithReplaceLinks(params.companyId, orders);

  return enriched.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    name: order.name,
    orderLabel: formatBusinessOrderNumber(order),
    customerName: extractCustomerName(order.shippingAddress, order.billingAddress),
    customerPhone: order.customerPhone,
    fulfillmentStage: order.fulfillmentStage,
    totalPrice: order.totalPrice.toString(),
    currency: order.currency,
    replacedByOrder: order.replacedByOrder
      ? { id: order.replacedByOrder.id, orderLabel: order.replacedByOrder.orderLabel }
      : null,
    replacedFromOrders: order.replacedFromOrders.map((row) => ({
      id: row.id,
      orderLabel: row.orderLabel,
    })),
  }));
}
