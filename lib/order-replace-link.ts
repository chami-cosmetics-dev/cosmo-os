import "server-only";

import { formatBusinessOrderNumber } from "@/lib/order-display-label";
import { prisma } from "@/lib/prisma";

export type OrderReplaceLinkSummary = {
  id: string;
  orderLabel: string;
  name: string | null;
  orderNumber: string | null;
  erpnextInvoiceId: string | null;
  cancelledAt?: string | null;
};

export class OrderReplaceLinkError extends Error {
  constructor(
    message: string,
    public readonly code: "not_cancelled" | "not_found" | "ambiguous" | "self" | "source_not_found"
  ) {
    super(message);
    this.name = "OrderReplaceLinkError";
  }
}

const summarySelect = {
  id: true,
  name: true,
  orderNumber: true,
  erpnextInvoiceId: true,
  shopifyOrderId: true,
  cancelledAt: true,
} as const;

function toSummary(order: {
  id: string;
  name: string | null;
  orderNumber: string | null;
  erpnextInvoiceId: string | null;
  shopifyOrderId: string;
  cancelledAt?: Date | null;
}): OrderReplaceLinkSummary {
  return {
    id: order.id,
    orderLabel: formatBusinessOrderNumber(order),
    name: order.name,
    orderNumber: order.orderNumber,
    erpnextInvoiceId: order.erpnextInvoiceId,
    ...(order.cancelledAt !== undefined
      ? { cancelledAt: order.cancelledAt?.toISOString() ?? null }
      : {}),
  };
}

/** Visible order-number variants staff may type (#1001 vs 1001). */
export function orderNumberMatchCandidates(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];
  const noHash = trimmed.replace(/^#+/, "").trim();
  const withHash = noHash ? `#${noHash}` : "";
  return [...new Set([trimmed, noHash, withHash].filter(Boolean))];
}

export async function resolveOrderByVisibleNumber(params: {
  companyId: string;
  orderNumber: string;
}): Promise<{ id: string } & Parameters<typeof toSummary>[0]> {
  const candidates = orderNumberMatchCandidates(params.orderNumber);
  if (candidates.length === 0) {
    throw new OrderReplaceLinkError("Order number is required", "not_found");
  }

  const matches = await prisma.order.findMany({
    where: {
      companyId: params.companyId,
      OR: candidates.flatMap((value) => [
        { name: { equals: value, mode: "insensitive" as const } },
        { orderNumber: { equals: value, mode: "insensitive" as const } },
        { erpnextInvoiceId: { equals: value, mode: "insensitive" as const } },
      ]),
    },
    select: summarySelect,
    take: 5,
  });

  const uniqueById = new Map(matches.map((row) => [row.id, row]));
  if (uniqueById.size === 0) {
    throw new OrderReplaceLinkError("No order matches that order number", "not_found");
  }
  if (uniqueById.size > 1) {
    throw new OrderReplaceLinkError(
      "Multiple orders match that order number; enter a more specific number",
      "ambiguous"
    );
  }

  return [...uniqueById.values()][0]!;
}

export async function setOrderReplacedBy(params: {
  companyId: string;
  sourceOrderId: string;
  replacedByOrderNumber: string | null;
}): Promise<{
  id: string;
  orderLabel: string;
  cancelledAt: string | null;
  replacedByOrder: OrderReplaceLinkSummary | null;
}> {
  const source = await prisma.order.findFirst({
    where: { id: params.sourceOrderId, companyId: params.companyId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      shopifyOrderId: true,
      cancelledAt: true,
      financialStatus: true,
    },
  });

  if (!source) {
    throw new OrderReplaceLinkError("Order not found", "source_not_found");
  }

  const isCancelled =
    Boolean(source.cancelledAt) || source.financialStatus?.toLowerCase() === "voided";
  if (!isCancelled) {
    throw new OrderReplaceLinkError(
      "Replacement link can only be set on a cancelled order",
      "not_cancelled"
    );
  }

  let nextId: string | null = null;
  if (params.replacedByOrderNumber !== null) {
    const target = await resolveOrderByVisibleNumber({
      companyId: params.companyId,
      orderNumber: params.replacedByOrderNumber,
    });
    if (target.id === source.id) {
      throw new OrderReplaceLinkError("An order cannot replace itself", "self");
    }
    nextId = target.id;
  }

  const updated = await prisma.order.update({
    where: { id: source.id },
    data: { replacedByOrderId: nextId },
    select: {
      id: true,
      name: true,
      orderNumber: true,
      erpnextInvoiceId: true,
      shopifyOrderId: true,
      cancelledAt: true,
      replacedByOrder: { select: summarySelect },
    },
  });

  return {
    id: updated.id,
    orderLabel: formatBusinessOrderNumber(updated),
    cancelledAt: updated.cancelledAt?.toISOString() ?? null,
    replacedByOrder: updated.replacedByOrder ? toSummary(updated.replacedByOrder) : null,
  };
}

export function summarizeReplaceLinkOrder(
  order: Parameters<typeof toSummary>[0]
): OrderReplaceLinkSummary {
  return toSummary(order);
}
