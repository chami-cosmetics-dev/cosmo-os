import type { Prisma } from "@prisma/client";

type OrderRef = {
  id: string;
  name: string | null;
  orderNumber: string | null;
  shopifyOrderId: string;
  totalPrice: Prisma.Decimal | { toString(): string };
};

export function orderDisplayLabel(order: Pick<OrderRef, "name" | "orderNumber" | "shopifyOrderId">) {
  return order.name ?? order.orderNumber ?? order.shopifyOrderId;
}

export function requiresOldItemCollection(reason: string) {
  return reason === "damaged_item" || reason === "wrong_item";
}

export function calculateExchangePaymentDifference(input: {
  originalOrder?: Pick<OrderRef, "totalPrice"> | null;
  replacementOrder?: Pick<OrderRef, "totalPrice"> | null;
}) {
  if (!input.originalOrder || !input.replacementOrder) {
    return null;
  }

  const replacementTotal = Number(input.replacementOrder.totalPrice.toString());
  const originalTotal = Number(input.originalOrder.totalPrice.toString());
  if (!Number.isFinite(replacementTotal) || !Number.isFinite(originalTotal)) {
    return null;
  }

  return (replacementTotal - originalTotal).toFixed(2);
}

