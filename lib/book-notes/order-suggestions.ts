import { Prisma } from "@prisma/client";

import { resolveBookNoteSalesInvoice } from "@/lib/book-notes/invoice-identity";
import { mapOrderPaymentsToBookNoteColumns } from "@/lib/book-notes/payment-columns";
import type { BookNoteOrderSuggestion } from "@/lib/book-notes/types";
import { parseAppCalendarDayStart } from "@/lib/format-datetime";
import { prisma } from "@/lib/prisma";

const POS_SOURCE_BOOST = new Set(["erpnext-pos", "pos", "erpnext"]);

function scoreOrder(sourceName: string, salesInvoice: string, q: string): number {
  let score = 0;
  if (POS_SOURCE_BOOST.has(sourceName.toLowerCase())) score += 10;
  const lowQ = q.toLowerCase();
  const lowSi = salesInvoice.toLowerCase();
  if (lowSi === lowQ) score += 50;
  else if (lowSi.endsWith(lowQ)) score += 30;
  else if (lowSi.includes(lowQ)) score += 15;
  return score;
}

export async function searchBookNoteOrderSuggestions(input: {
  companyId: string;
  companyLocationId: string;
  q: string;
  postingDate?: string;
  limit?: number;
}): Promise<BookNoteOrderSuggestion[]> {
  const q = input.q.trim();
  if (q.length < 2) return [];

  const limit = Math.min(Math.max(input.limit ?? 20, 1), 20);

  const where: Prisma.OrderWhereInput = {
    companyId: input.companyId,
    companyLocationId: input.companyLocationId,
    OR: [
      { erpnextInvoiceId: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { orderNumber: { contains: q, mode: "insensitive" } },
      { shopifyOrderId: { contains: q, mode: "insensitive" } },
    ],
  };

  if (input.postingDate) {
    const start = parseAppCalendarDayStart(input.postingDate);
    if (start) {
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      // Soft prefer: still search without date if we want — contract says prefer day.
      // Apply as filter when postingDate provided so merchants see that day's POS first.
      where.createdAt = { gte: start, lt: end };
    }
  }

  let orders = await prisma.order.findMany({
    where,
    take: limit * 3,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      shopifyOrderId: true,
      erpnextInvoiceId: true,
      totalPrice: true,
      paymentGatewayPrimary: true,
      paymentGatewayNames: true,
      rawPayload: true,
      sourceName: true,
    },
  });

  // If date-scoped search is empty, fall back without date so typing still works.
  if (orders.length === 0 && input.postingDate) {
    const { createdAt: _drop, ...rest } = where;
    void _drop;
    orders = await prisma.order.findMany({
      where: rest,
      take: limit * 3,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        orderNumber: true,
        shopifyOrderId: true,
        erpnextInvoiceId: true,
        totalPrice: true,
        paymentGatewayPrimary: true,
        paymentGatewayNames: true,
        rawPayload: true,
        sourceName: true,
      },
    });
  }

  const mapped = orders
    .map((order) => {
      const salesInvoice = resolveBookNoteSalesInvoice(order);
      if (!salesInvoice) return null;
      const amounts = mapOrderPaymentsToBookNoteColumns({
        totalPrice: order.totalPrice,
        paymentGatewayPrimary: order.paymentGatewayPrimary,
        paymentGatewayNames: order.paymentGatewayNames,
        rawPayload: order.rawPayload,
      });
      const totalPrice = Number(order.totalPrice ?? 0);
      return {
        suggestion: {
          orderId: order.id,
          salesInvoice,
          label: salesInvoice,
          totalPrice: Number.isFinite(totalPrice) ? totalPrice : 0,
          cash: amounts.cash,
          card: amounts.card,
          koko: amounts.koko,
          bankTransfer: amounts.bankTransfer,
          paymentGatewayPrimary: order.paymentGatewayPrimary,
          sourceName: order.sourceName,
        } satisfies BookNoteOrderSuggestion,
        score: scoreOrder(order.sourceName, salesInvoice, q),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.suggestion);

  return mapped;
}
